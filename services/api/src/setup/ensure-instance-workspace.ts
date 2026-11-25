import { DEFAULT_PERSONAL_VAULT_NAME } from "@okkey/types";

import type { DeploymentMode } from "../config.ts";
import { DEFAULT_NEW_VAULT_CRYPTO_VERSION } from "../crypto/downgrade.ts";
import { generateEntityId } from "../entity-id.ts";
import type { Logger } from "../logger.ts";
import type { PostgresDatabase, QueryExecutor } from "../storage/postgres.ts";

/**
 * Advisory lock class shared with SQL migrations ("OKKY"); object 2 = instance workspace cleanup.
 * Distinct from migrate.ts object 1 so the two steps never deadlock on the same key.
 */
export const INSTANCE_WORKSPACE_ADVISORY_LOCK_KEY1 = 0x4f4b4b59;
export const INSTANCE_WORKSPACE_ADVISORY_LOCK_KEY2 = 2;

export type EnsureSelfHostedInstanceWorkspaceInput = {
  db: PostgresDatabase;
  deploymentMode: DeploymentMode;
  logger?: Pick<Logger, "info" | "warn" | "error">;
};

/**
 * Self-hosted only: when `workspace_id` is still null and users already exist (upgrade path),
 * pick the instance workspace, write `workspace_id` + `setup_completed_at`, ensure personal
 * vaults, block non-members (sessions + devices), and delete every other workspace.
 *
 * Idempotent: a second start with `workspace_id` set is a no-op.
 * SaaS (`deploymentMode !== "self_hosted"`) never runs the cleanup.
 */
export async function ensureSelfHostedInstanceWorkspace(
  input: EnsureSelfHostedInstanceWorkspaceInput,
): Promise<{ ran: boolean; workspaceId: string | null }> {
  if (input.deploymentMode !== "self_hosted") {
    return { ran: false, workspaceId: null };
  }

  return input.db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1, $2)", [
      INSTANCE_WORKSPACE_ADVISORY_LOCK_KEY1,
      INSTANCE_WORKSPACE_ADVISORY_LOCK_KEY2,
    ]);
    return runSelfHostedInstanceWorkspaceCleanup(tx, input.logger);
  });
}

async function runSelfHostedInstanceWorkspaceCleanup(
  tx: QueryExecutor,
  logger?: Pick<Logger, "info" | "warn" | "error">,
): Promise<{ ran: boolean; workspaceId: string | null }> {
  const settingsRows = await tx.query<{
    workspace_id: string | null;
    setup_completed_at: string | Date | null;
  }>(
    `
      SELECT workspace_id, setup_completed_at
      FROM server_instance_settings
      WHERE id = TRUE
      FOR UPDATE
    `,
  );
  const settings = settingsRows[0];
  if (!settings) {
    logger?.warn("self-hosted instance workspace cleanup skipped: settings row missing");
    return { ran: false, workspaceId: null };
  }

  if (settings.workspace_id != null) {
    return { ran: false, workspaceId: String(settings.workspace_id) };
  }

  const userCountRows = await tx.query<{ n: string | number }>(
    `SELECT COUNT(*)::bigint AS n FROM users`,
  );
  const userCount = Number(userCountRows[0]?.n ?? 0);
  if (!Number.isFinite(userCount) || userCount <= 0) {
    return { ran: false, workspaceId: null };
  }

  const picked = await tx.query<{ id: string }>(
    `
      SELECT w.id
      FROM workspaces w
      INNER JOIN users u ON u.id = w.owner_id
      ORDER BY u.created_at ASC, u.id ASC, w.created_at ASC, w.id ASC
      LIMIT 1
    `,
  );
  const instanceWs = picked[0]?.id;
  if (!instanceWs) {
    logger?.warn("self-hosted instance workspace cleanup: users exist but no workspace found");
    return { ran: false, workspaceId: null };
  }

  await tx.query(
    `
      UPDATE server_instance_settings
      SET workspace_id = $1::bigint,
          setup_completed_at = COALESCE(setup_completed_at, now()),
          registration_mode = 'invite_only',
          updated_at = now()
      WHERE id = TRUE
    `,
    [instanceWs],
  );

  const members = await tx.query<{ member_user_id: string }>(
    `
      SELECT w.owner_id AS member_user_id
      FROM workspaces w
      WHERE w.id = $1
      UNION
      SELECT wm.user_id AS member_user_id
      FROM workspace_members wm
      WHERE wm.workspace_id = $1
    `,
    [instanceWs],
  );

  for (const member of members) {
    const existing = await tx.query<{ id: string }>(
      `
        SELECT id
        FROM vaults
        WHERE workspace_id = $1
          AND is_personal = TRUE
          AND owner_id = $2
        LIMIT 1
      `,
      [instanceWs, member.member_user_id],
    );
    if (existing[0]) {
      continue;
    }
    const vaultId = generateEntityId();
    await tx.query(
      `
        INSERT INTO vaults (id, workspace_id, name, description, icon, is_personal, owner_id, crypto_version)
        VALUES ($1, $2, $3, '', '', TRUE, $4, $5)
      `,
      [
        vaultId,
        instanceWs,
        DEFAULT_PERSONAL_VAULT_NAME,
        member.member_user_id,
        DEFAULT_NEW_VAULT_CRYPTO_VERSION,
      ],
    );
  }

  await tx.query(
    `
      UPDATE users u
      SET blocked_at = COALESCE(u.blocked_at, now()),
          updated_at = now()
      WHERE NOT EXISTS (
          SELECT 1 FROM workspaces w
          WHERE w.id = $1 AND w.owner_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.workspace_id = $1 AND wm.user_id = u.id
        )
    `,
    [instanceWs],
  );

  await tx.query(
    `
      DELETE FROM sessions s
      USING users u
      WHERE s.user_id = u.id
        AND u.blocked_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM workspaces w
          WHERE w.id = $1 AND w.owner_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.workspace_id = $1 AND wm.user_id = u.id
        )
    `,
    [instanceWs],
  );

  await tx.query(
    `
      UPDATE devices d
      SET
        status = 'revoked',
        revoked_at = COALESCE(d.revoked_at, now()),
        device_share = NULL
      FROM users u
      WHERE d.user_id = u.id
        AND u.blocked_at IS NOT NULL
        AND d.status IN ('trusted', 'pending', 'blocked')
        AND NOT EXISTS (
          SELECT 1 FROM workspaces w
          WHERE w.id = $1 AND w.owner_id = u.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.workspace_id = $1 AND wm.user_id = u.id
        )
    `,
    [instanceWs],
  );

  await tx.query(
    `
      UPDATE workspaces
      SET logo_vault_id = NULL
      WHERE id IS DISTINCT FROM $1::bigint
    `,
    [instanceWs],
  );

  await tx.query(
    `
      DELETE FROM workspaces
      WHERE id IS DISTINCT FROM $1::bigint
    `,
    [instanceWs],
  );

  logger?.info("self-hosted instance workspace cleanup applied", {
    workspaceId: String(instanceWs),
  });
  return { ran: true, workspaceId: String(instanceWs) };
}
