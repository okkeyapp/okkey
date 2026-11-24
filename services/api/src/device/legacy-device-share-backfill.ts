/**
 * Startup pass over stored device shares.
 *
 * A framed hybrid envelope is left as-is. A raw 32-byte share is re-wrapped
 * with `wrapSplitKeyShareB` when this process can see that device's wrap
 * public keys. Upgraded installations do not store those keys, so the share
 * is cleared and the client uploads an envelope on the next sign-in.
 * A failed re-wrap is cleared the same way. Each write matches the bytes that
 * were read, so a second pass does not write.
 */
import { classifySplitKeyShareBWire, wrapSplitKeyShareB } from "@okkey/crypto";
import { ensureApiCryptoWasm } from "../crypto/wasm-runtime.ts";
import type { Logger } from "../logger.ts";
import type { QueryExecutor } from "../storage/postgres.ts";

export type DeviceShareWrapPublicKeys = {
  ed25519PublicKey: Uint8Array;
  mlkemEncapsulationKey: Uint8Array;
};

export type LegacyDeviceShareRow = {
  id: string;
  userId: string;
  deviceShare: Uint8Array;
};

export type LegacyDeviceShareBackfillResult = {
  rewrapped: number;
  cleared: number;
  unchanged: number;
};

type StoredShareRow = {
  id: string;
  user_id: string;
  status: string;
  device_share: Buffer;
  created_at: string | Date;
  rejected_at: string | Date | null;
  revoked_at: string | Date | null;
  rejection_reason: string | null;
};

export async function backfillLegacyDeviceShares(
  db: QueryExecutor,
  options: {
    now?: Date;
    approvalTtlMs: number;
    /** Limit the pass to these accounts. Startup scans every row. */
    userIds?: string[];
    logger?: Pick<Logger, "info" | "warn">;
    /**
     * Public wrap keys for a raw share. The default finds none: a legacy row
     * is only the 32-byte share and does not carry the device wrap key.
     */
    resolveWrapKeys?: (
      row: LegacyDeviceShareRow,
    ) => Promise<DeviceShareWrapPublicKeys | null> | DeviceShareWrapPublicKeys | null;
  },
): Promise<LegacyDeviceShareBackfillResult> {
  const now = options.now ?? new Date();
  const resolveWrapKeys = options.resolveWrapKeys ?? (() => null);
  const userIds = options.userIds?.map((id) => id.trim()).filter((id) => id.length > 0) ?? [];
  const scoped = userIds.length > 0;
  const rows = await db.query<StoredShareRow>(
    `
      SELECT
        id::text AS id,
        user_id::text AS user_id,
        status,
        device_share,
        created_at,
        rejected_at,
        revoked_at,
        rejection_reason
      FROM devices
      WHERE device_share IS NOT NULL
        ${scoped ? "AND user_id::text = ANY($1::text[])" : ""}
    `,
    scoped ? [userIds] : [],
  );

  const result: LegacyDeviceShareBackfillResult = {
    rewrapped: 0,
    cleared: 0,
    unchanged: 0,
  };

  for (const row of rows) {
    const share = Uint8Array.from(row.device_share);
    if (isInactiveShare(row, now, options.approvalTtlMs)) {
      if (await clearShare(db, row.id, share)) {
        result.cleared += 1;
      } else {
        result.unchanged += 1;
      }
      continue;
    }

    const kind = classifySplitKeyShareBWire(share);
    if (kind === "hybrid") {
      result.unchanged += 1;
      continue;
    }

    if (kind === "legacy") {
      const keys = await resolveWrapKeys({
        id: row.id,
        userId: row.user_id,
        deviceShare: share,
      });
      if (keys) {
        try {
          ensureApiCryptoWasm();
          const wrapped = await wrapSplitKeyShareB({
            share,
            recipientEd25519PublicKey: keys.ed25519PublicKey,
            recipientMlkemEncapsulationKey: keys.mlkemEncapsulationKey,
          });
          const updated = await db.query<{ id: string }>(
            `
              UPDATE devices
              SET device_share = $2
              WHERE id = $1::bigint
                AND device_share = $3
              RETURNING id::text AS id
            `,
            [row.id, Buffer.from(wrapped), Buffer.from(share)],
          );
          if (updated.length === 0) {
            result.unchanged += 1;
            continue;
          }
          result.rewrapped += 1;
          continue;
        } catch (error: unknown) {
          options.logger?.warn("device share re-wrap failed; clearing the stored share", {
            deviceId: row.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (await clearShare(db, row.id, share)) {
      result.cleared += 1;
    } else {
      result.unchanged += 1;
    }
  }

  options.logger?.info("device share backfill finished", result);
  return result;
}

function isInactiveShare(row: StoredShareRow, now: Date, approvalTtlMs: number): boolean {
  if (row.status === "revoked" || row.rejected_at != null || row.revoked_at != null) {
    return true;
  }
  if (row.rejection_reason === "approval expired") {
    return true;
  }
  if (row.status !== "pending") {
    return false;
  }
  const createdMs = new Date(row.created_at).getTime();
  return Number.isFinite(createdMs) && createdMs <= now.getTime() - approvalTtlMs;
}

async function clearShare(
  db: QueryExecutor,
  deviceId: string,
  expected: Uint8Array,
): Promise<boolean> {
  const updated = await db.query<{ id: string }>(
    `
      UPDATE devices
      SET device_share = NULL
      WHERE id = $1::bigint
        AND device_share = $2
      RETURNING id::text AS id
    `,
    [deviceId, Buffer.from(expected)],
  );
  return updated.length > 0;
}
