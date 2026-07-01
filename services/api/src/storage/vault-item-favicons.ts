import type { QueryExecutor } from "./postgres.ts";

export interface VaultItemFaviconRecord {
  id: string;
  vaultId: string;
  itemId: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: {
  id: string;
  vault_id: string;
  item_id: string;
  created_at: string;
  updated_at: string;
}): VaultItemFaviconRecord {
  return {
    id: row.id,
    vaultId: row.vault_id,
    itemId: row.item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class VaultItemFaviconsRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async findByVaultAndItem(vaultId: string, itemId: string): Promise<VaultItemFaviconRecord | null> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, vault_id, item_id, created_at, updated_at
        FROM vault_item_favicons
        WHERE vault_id = $1 AND item_id = $2
      `,
      [vaultId, itemId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findById(faviconId: string): Promise<VaultItemFaviconRecord | null> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, vault_id, item_id, created_at, updated_at
        FROM vault_item_favicons
        WHERE id = $1
      `,
      [faviconId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async upsert(input: { id: string; vaultId: string; itemId: string }): Promise<VaultItemFaviconRecord> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        INSERT INTO vault_item_favicons (id, vault_id, item_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (vault_id, item_id) DO UPDATE SET
          id = EXCLUDED.id,
          updated_at = now()
        RETURNING id, vault_id, item_id, created_at, updated_at
      `,
      [input.id, input.vaultId, input.itemId],
    );
    return mapRow(rows[0]!);
  }

  async deleteByVaultAndItem(vaultId: string, itemId: string): Promise<string | null> {
    const rows = await this.db.query<{ id: string }>(
      `
        DELETE FROM vault_item_favicons
        WHERE vault_id = $1 AND item_id = $2
        RETURNING id
      `,
      [vaultId, itemId],
    );
    return rows[0]?.id ?? null;
  }
}
