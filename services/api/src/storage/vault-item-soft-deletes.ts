import type { QueryExecutor } from "./postgres.ts";

export interface VaultItemSoftDeleteRecord {
  vaultId: string;
  itemId: string;
  deletedAtMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpiredSoftDeleteRecord {
  vaultId: string;
  itemId: string;
  deletedAtMs: number;
  workspaceId: string;
  retentionDays: number;
}

export class VaultItemSoftDeletesRepository {
  private readonly db: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };

  constructor(
    db: QueryExecutor & {
      transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
    },
  ) {
    this.db = db;
  }

  async upsert(input: {
    vaultId: string;
    itemId: string;
    deletedAtMs: number;
  }): Promise<void> {
    await this.db.query(
      `
        INSERT INTO vault_item_soft_deletes (vault_id, item_id, deleted_at_ms)
        VALUES ($1, $2, $3)
        ON CONFLICT (vault_id, item_id) DO UPDATE SET
          deleted_at_ms = EXCLUDED.deleted_at_ms,
          updated_at = now()
      `,
      [input.vaultId, input.itemId, input.deletedAtMs],
    );
  }

  async remove(vaultId: string, itemId: string): Promise<void> {
    await this.db.query(
      "DELETE FROM vault_item_soft_deletes WHERE vault_id = $1 AND item_id = $2",
      [vaultId, itemId],
    );
  }

  async listExpired(nowMs = Date.now()): Promise<ExpiredSoftDeleteRecord[]> {
    const rows = await this.db.query<{
      vault_id: string;
      item_id: string;
      deleted_at_ms: string;
      workspace_id: string;
      retention_days: number;
    }>(
      `
        SELECT sd.vault_id, sd.item_id, sd.deleted_at_ms, v.workspace_id, w.deleted_items_retention_days AS retention_days
        FROM vault_item_soft_deletes sd
        INNER JOIN vaults v ON v.id = sd.vault_id
        INNER JOIN workspaces w ON w.id = v.workspace_id
        WHERE sd.deleted_at_ms + (w.deleted_items_retention_days::bigint * 86400000) <= $1
      `,
      [nowMs],
    );
    return rows.map((row) => ({
      vaultId: row.vault_id,
      itemId: row.item_id,
      deletedAtMs: Number(row.deleted_at_ms),
      workspaceId: row.workspace_id,
      retentionDays: row.retention_days,
    }));
  }
}
