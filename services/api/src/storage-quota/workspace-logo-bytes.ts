import type { QueryExecutor } from "../storage/postgres.ts";

/**
 * Current workspace-logo ciphertext size.
 *
 * Storage quota counts this once, the same way attachment `size` is counted:
 * the latest ciphertext only. A replace contributes `additionalBytes` = new
 * length and `replacedBytes` = previous length (net change is new - old).
 * A delete contributes `replacedBytes` = previous length and frees the usage.
 *
 * SaaS quota measurement should add:
 * `COALESCE((SELECT ciphertext_bytes FROM workspace_logos WHERE workspace_id = $1), 0)`
 */
export const WORKSPACE_LOGO_CIPHERTEXT_BYTES_SQL =
  "COALESCE((SELECT ciphertext_bytes FROM workspace_logos WHERE workspace_id = $1), 0)";

export async function readWorkspaceLogoCiphertextBytes(
  db: QueryExecutor,
  workspaceId: string,
): Promise<number> {
  const rows = await db.query<{ bytes: string | number | null }>(
    `SELECT ${WORKSPACE_LOGO_CIPHERTEXT_BYTES_SQL} AS bytes`,
    [workspaceId],
  );
  const raw = rows[0]?.bytes;
  const bytes = typeof raw === "number" ? raw : Number(raw ?? 0);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 0;
  }
  return bytes;
}

export function workspaceLogoQuotaDelta(
  previousBytes: number,
  nextBytes: number,
): { usageBytes: number; additionalBytes: number; replacedBytes: number } {
  return {
    usageBytes: nextBytes,
    additionalBytes: nextBytes,
    replacedBytes: previousBytes,
  };
}
