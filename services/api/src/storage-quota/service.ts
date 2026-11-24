import {
  PLAN_QUOTA_EXCEEDED,
  getPlanQuotaLimits,
  resolveWorkspaceStorageLimitBytes,
  resolveWorkspaceStorageLimitMb,
  storageWriteExceedsQuota,
  type PlanFeatureOverrides,
  type WorkspaceStorageQuota,
  type WorkspaceStorageQuotaStatus,
} from "@okkey/types";

import {
  workspaceHasPlanFeature,
  type PlanEntitlementRuntimeConfig,
} from "../plan-entitlements.ts";
import type { QueryExecutor } from "../storage/postgres.ts";

export const PLAN_QUOTA_EXCEEDED_MESSAGE =
  "This workspace has reached its storage limit. Delete something or upgrade the plan to save more.";

export class PlanQuotaExceededError extends Error {
  readonly code = PLAN_QUOTA_EXCEEDED;
  readonly statusCode = 403;
  readonly details: Record<string, unknown>;

  constructor(details: Record<string, unknown>, message = PLAN_QUOTA_EXCEEDED_MESSAGE) {
    super(message);
    this.name = "PlanQuotaExceededError";
    this.details = details;
  }
}

export type StorageQuotaWorkspace = {
  id: string;
  planTier?: string | null;
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

/**
 * Counts current encrypted workspace content and rejects writes over the plan ceiling
 * when `storageQuotas` is on for the plan and deployment.
 * Self-hosted deployments keep a null ceiling (modules off forces the flag off; modules on
 * still replace the catalog ceiling with none), so writes return before any usage query.
 * Settings snapshots still report usage so the client can show it.
 *
 * Counted bytes:
 * - latest item ciphertext (events) that is not soft-deleted
 * - attachment sizes
 * - capsule payload and metadata ciphertext
 * - capsule file objects
 * - current workspace logo ciphertext (`workspace_logos.ciphertext_bytes`)
 *
 * Item history older than the latest payload is not counted, so an update replaces usage
 * and a delete frees it. Folder metadata events are not item content and are not counted.
 */
export class WorkspaceStorageQuotaService {
  private readonly db: QueryExecutor;
  private readonly config: PlanEntitlementRuntimeConfig;

  constructor(deps: { db: QueryExecutor; config: PlanEntitlementRuntimeConfig }) {
    this.db = deps.db;
    this.config = deps.config;
  }

  async snapshot(workspace: StorageQuotaWorkspace): Promise<WorkspaceStorageQuotaStatus> {
    const storageQuota = this.storageQuotaFor(workspace);
    if (storageQuota.baseMb === null) {
      return {
        ...storageQuota,
        limitMb: null,
        limitBytes: null,
        usedBytes: await this.measureUsedBytes(workspace.id),
        activeMemberCount: 0,
      };
    }

    const storedMembers = await this.countMembers(workspace.id);
    // The owner always counts, even if the membership row has not been seeded yet.
    const activeMemberCount = Math.max(1, storedMembers);
    const limitMb = resolveWorkspaceStorageLimitMb(storageQuota, activeMemberCount);
    const limitBytes = resolveWorkspaceStorageLimitBytes(storageQuota, activeMemberCount);
    const usedBytes = await this.measureUsedBytes(workspace.id);
    return {
      ...storageQuota,
      limitMb,
      limitBytes,
      usedBytes,
      activeMemberCount,
    };
  }

  async assertAdditionalBytes(input: {
    workspace: StorageQuotaWorkspace;
    additionalBytes: number;
    replacedBytes?: number;
  }): Promise<void> {
    const storageQuota = this.storageQuotaFor(input.workspace);
    if (storageQuota.baseMb === null) {
      return;
    }
    const status = await this.snapshot(input.workspace);
    if (
      !storageWriteExceedsQuota({
        limitBytes: status.limitBytes,
        usedBytes: status.usedBytes,
        additionalBytes: input.additionalBytes,
        replacedBytes: input.replacedBytes,
      })
    ) {
      return;
    }
    throw new PlanQuotaExceededError({
      limitMb: status.limitMb,
      limitBytes: status.limitBytes,
      usedBytes: status.usedBytes,
      activeMemberCount: status.activeMemberCount,
      incomingBytes: Math.max(0, input.additionalBytes),
    });
  }

  async assertVaultItemWrite(input: {
    workspace: StorageQuotaWorkspace;
    vaultId: string;
    referencedItemId: string;
    eventType: "ITEM_CREATE" | "ITEM_UPDATE";
    nextPayloadBytes: number;
  }): Promise<void> {
    const storageQuota = this.storageQuotaFor(input.workspace);
    if (storageQuota.baseMb === null) {
      return;
    }
    let replacedBytes = 0;
    if (input.eventType === "ITEM_UPDATE") {
      const current = await this.currentItemPayload(input.vaultId, input.referencedItemId);
      if (current.counts) {
        replacedBytes = current.bytes;
      }
    }
    await this.assertAdditionalBytes({
      workspace: input.workspace,
      additionalBytes: input.nextPayloadBytes,
      replacedBytes,
    });
  }

  async replacedItemFaviconBytes(vaultId: string, itemId: string): Promise<number> {
    const rows = await this.db.query<{ bytes: string | number }>(
      `
        SELECT COALESCE(SUM(size), 0)::text AS bytes
        FROM attachments
        WHERE vault_id = $1::bigint
          AND item_id = $2::bigint
          AND purpose = 'item-favicon'
      `,
      [vaultId, itemId],
    );
    return readNonNegative(rows[0]?.bytes);
  }

  /**
   * Catalog ceiling when `storageQuotas` is enabled. Otherwise no ceiling, including
   * self-hosted FREE (flag off) and any plan that turns the flag off.
   * Self-hosted ceilings stay null in {@link getPlanQuotaLimits} even when the flag is on.
   */
  private storageQuotaFor(workspace: StorageQuotaWorkspace): WorkspaceStorageQuota {
    if (!workspaceHasPlanFeature(this.config, workspace, "storageQuotas")) {
      return { baseMb: null, perMemberMb: 0 };
    }
    return getPlanQuotaLimits(workspace.planTier, {
      deploymentMode: this.config.deploymentMode,
      enterpriseModulesActive: this.config.enterpriseModulesEnabled,
    }).storageQuota;
  }

  private async countMembers(workspaceId: string): Promise<number> {
    const rows = await this.db.query<{ count: string | number }>(
      `
        SELECT COUNT(*)::text AS count
        FROM workspace_members
        WHERE workspace_id = $1::bigint
      `,
      [workspaceId],
    );
    return readNonNegative(rows[0]?.count);
  }

  private async measureUsedBytes(workspaceId: string): Promise<number> {
    const rows = await this.db.query<{ used_bytes: string | number }>(
      `
        SELECT (
          COALESCE((
            SELECT SUM(octet_length(latest.encrypted_payload))
            FROM (
              SELECT DISTINCT ON (e.referenced_item_id)
                e.vault_id,
                e.referenced_item_id,
                e.encrypted_payload,
                e.event_type,
                e.item_soft_deleted
              FROM events e
              INNER JOIN vaults v ON v.id = e.vault_id
              WHERE v.workspace_id = $1::bigint
                AND e.referenced_item_id IS NOT NULL
                AND e.event_type IN ('ITEM_CREATE', 'ITEM_UPDATE', 'ITEM_DELETE')
              ORDER BY e.referenced_item_id, e.version DESC
            ) latest
            WHERE latest.event_type <> 'ITEM_DELETE'
              AND latest.item_soft_deleted IS NOT TRUE
              AND NOT EXISTS (
                SELECT 1
                FROM vault_item_soft_deletes sd
                WHERE sd.vault_id = latest.vault_id
                  AND sd.item_id = latest.referenced_item_id
              )
          ), 0)
          + COALESCE((
            SELECT SUM(a.size)
            FROM attachments a
            INNER JOIN vaults v ON v.id = a.vault_id
            WHERE v.workspace_id = $1::bigint
          ), 0)
          + COALESCE((
            SELECT SUM(
              octet_length(c.encrypted_payload)
              + octet_length(COALESCE(c.encrypted_metadata, ''::bytea))
            )
            FROM capsules c
            WHERE c.workspace_id = $1::bigint
          ), 0)
          + COALESCE((
            SELECT SUM(cf.size_bytes)
            FROM capsule_files cf
            INNER JOIN capsules c ON c.id = cf.capsule_id
            WHERE c.workspace_id = $1::bigint
          ), 0)
          + COALESCE((
            SELECT ciphertext_bytes
            FROM workspace_logos
            WHERE workspace_id = $1::bigint
          ), 0)
        )::text AS used_bytes
      `,
      [workspaceId],
    );
    return readNonNegative(rows[0]?.used_bytes);
  }

  private async currentItemPayload(
    vaultId: string,
    referencedItemId: string,
  ): Promise<{ bytes: number; counts: boolean }> {
    const rows = await this.db.query<{
      bytes: string | number;
      excluded: boolean;
    }>(
      `
        SELECT
          octet_length(e.encrypted_payload)::text AS bytes,
          (
            e.event_type = 'ITEM_DELETE'
            OR e.item_soft_deleted IS TRUE
            OR EXISTS (
              SELECT 1
              FROM vault_item_soft_deletes sd
              WHERE sd.vault_id = e.vault_id
                AND sd.item_id = e.referenced_item_id
            )
          ) AS excluded
        FROM events e
        WHERE e.vault_id = $1::bigint
          AND e.referenced_item_id = $2::bigint
          AND e.event_type IN ('ITEM_CREATE', 'ITEM_UPDATE', 'ITEM_DELETE')
        ORDER BY e.version DESC
        LIMIT 1
      `,
      [vaultId, referencedItemId],
    );
    const row = rows[0];
    if (!row || row.excluded) {
      return { bytes: 0, counts: false };
    }
    return { bytes: readNonNegative(row.bytes), counts: true };
  }
}

function readNonNegative(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}
