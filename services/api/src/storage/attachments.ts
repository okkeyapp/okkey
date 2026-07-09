import type { QueryExecutor } from "./postgres.ts";

export interface AttachmentRecord {
  id: string;
  vaultId: string;
  itemId: string | null;
  storageKey: string;
  encryptedKey: Uint8Array;
  size: number;
  createdAt: string;
}

function mapRow(row: {
  id: string;
  vault_id: string;
  item_id: string | null;
  storage_key: string;
  encrypted_key: Uint8Array | Buffer;
  size: string | number;
  created_at: string;
}): AttachmentRecord {
  return {
    id: row.id,
    vaultId: row.vault_id,
    itemId: row.item_id,
    storageKey: row.storage_key,
    encryptedKey: row.encrypted_key instanceof Uint8Array ? new Uint8Array(row.encrypted_key) : Uint8Array.from(row.encrypted_key),
    size: typeof row.size === "number" ? row.size : Number(row.size),
    createdAt: row.created_at,
  };
}

export class AttachmentsRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async create(input: {
    id: string;
    vaultId: string;
    itemId: string;
    storageKey: string;
    encryptedKey: Uint8Array;
    size: number;
  }): Promise<AttachmentRecord> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      created_at: string;
    }>(
      `
        INSERT INTO attachments (id, vault_id, item_id, storage_key, encrypted_key, size)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, vault_id, item_id, storage_key, encrypted_key, size, created_at
      `,
      [input.id, input.vaultId, input.itemId, input.storageKey, Buffer.from(input.encryptedKey), input.size],
    );
    return mapRow(rows[0]!);
  }

  async findByVaultItemAndId(vaultId: string, itemId: string, attachmentId: string): Promise<AttachmentRecord | null> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      created_at: string;
    }>(
      `
        SELECT id, vault_id, item_id, storage_key, encrypted_key, size, created_at
        FROM attachments
        WHERE vault_id = $1 AND item_id = $2 AND id = $3
      `,
      [vaultId, itemId, attachmentId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async deleteByVaultItemAndId(vaultId: string, itemId: string, attachmentId: string): Promise<AttachmentRecord | null> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      created_at: string;
    }>(
      `
        DELETE FROM attachments
        WHERE vault_id = $1 AND item_id = $2 AND id = $3
        RETURNING id, vault_id, item_id, storage_key, encrypted_key, size, created_at
      `,
      [vaultId, itemId, attachmentId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }
}
