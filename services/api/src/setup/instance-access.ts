import type { DeploymentMode } from "../config.ts";
import type { QueryExecutor } from "../storage/postgres.ts";

export class InstanceAccessError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "InstanceAccessError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type InstanceSettingsAccessRow = {
  workspaceId: string | null;
  setupCompletedAt: string | null;
  registrationMode: "open" | "invite_only";
};

/**
 * Read the singleton instance workspace pointer.
 * Returns null fields when the settings row is missing.
 */
export async function readInstanceSettings(
  db: QueryExecutor,
): Promise<InstanceSettingsAccessRow> {
  const rows = await db.query<{
    workspace_id: string | null;
    setup_completed_at: string | Date | null;
    registration_mode: string;
  }>(
    `
      SELECT workspace_id, setup_completed_at, registration_mode
      FROM server_instance_settings
      WHERE id = TRUE
      LIMIT 1
    `,
  );
  const row = rows[0];
  if (!row) {
    return { workspaceId: null, setupCompletedAt: null, registrationMode: "invite_only" };
  }
  const completed = row.setup_completed_at;
  return {
    workspaceId: row.workspace_id == null ? null : String(row.workspace_id),
    setupCompletedAt:
      completed == null
        ? null
        : completed instanceof Date
          ? completed.toISOString()
          : String(completed),
    registrationMode: row.registration_mode === "open" ? "open" : "invite_only",
  };
}

/** True when the user owns or is a member of the given workspace. */
export async function userHasWorkspaceAccess(
  db: QueryExecutor,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1 FROM (
          SELECT 1 AS x FROM workspaces w
          WHERE w.id = $1 AND w.owner_id = $2
          UNION ALL
          SELECT 1 AS x FROM workspace_members wm
          WHERE wm.workspace_id = $1 AND wm.user_id = $2
        ) rows
      ) AS ok
    `,
    [workspaceId, userId],
  );
  return Boolean(rows[0]?.ok);
}

export async function isUserBlocked(db: QueryExecutor, userId: string): Promise<boolean> {
  const rows = await db.query<{ blocked_at: string | Date | null }>(
    `SELECT blocked_at FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0]?.blocked_at != null;
}

/**
 * Self-hosted gate after first-run: user must be an unblocked member of the instance workspace.
 * SaaS and incomplete setup are no-ops (return true).
 */
export async function assertSelfHostedInstanceAccess(
  db: QueryExecutor,
  input: { deploymentMode: DeploymentMode; userId: string },
): Promise<void> {
  if (input.deploymentMode !== "self_hosted") {
    return;
  }
  if (await isUserBlocked(db, input.userId)) {
    throw new InstanceAccessError(
      "ACCOUNT_BLOCKED",
      403,
      "account access to this instance has been revoked",
    );
  }
  const settings = await readInstanceSettings(db);
  if (!settings.setupCompletedAt || !settings.workspaceId) {
    // First-run owner may authenticate before finish writes workspace_id.
    return;
  }
  const allowed = await userHasWorkspaceAccess(db, settings.workspaceId, input.userId);
  if (!allowed) {
    throw new InstanceAccessError(
      "INSTANCE_ACCESS_DENIED",
      403,
      "account is not a member of the instance workspace",
    );
  }
}

/**
 * Soft check used by auth middleware (null = deny without throwing).
 */
export async function hasSelfHostedInstanceAccess(
  db: QueryExecutor,
  input: { deploymentMode: DeploymentMode; userId: string },
): Promise<boolean> {
  try {
    await assertSelfHostedInstanceAccess(db, input);
    return true;
  } catch (error) {
    if (error instanceof InstanceAccessError) {
      return false;
    }
    throw error;
  }
}

/**
 * Block account, revoke all devices, and delete all sessions in one transaction.
 * Used when a member is removed from the instance workspace on self-hosted.
 */
export async function blockAccountAndRevokeAccess(
  tx: QueryExecutor,
  userId: string,
  nowIso: string,
): Promise<void> {
  await tx.query(
    `
      UPDATE users
      SET blocked_at = COALESCE(blocked_at, $2::timestamptz),
          updated_at = now()
      WHERE id = $1
    `,
    [userId, nowIso],
  );
  await tx.query(
    `
      UPDATE devices
      SET
        status = 'revoked',
        revoked_at = COALESCE(revoked_at, $2::timestamptz),
        device_share = NULL
      WHERE user_id = $1
        AND status IN ('trusted', 'pending', 'blocked')
    `,
    [userId, nowIso],
  );
  await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}
