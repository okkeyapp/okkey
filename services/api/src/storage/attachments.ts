import type { QueryExecutor } from "./postgres.ts";

export interface AttachmentRecord {
  id: string;
  vaultId: string;
  itemId: string | null;
  storageKey: string;
  encryptedKey: Uint8Array;
  size: number;
  purpose: string | null;
  createdAt: string;
}

function mapRow(row: {
  id: string;
  vault_id: string;
  item_id: string | null;
  storage_key: string;
  encrypted_key: Uint8Array | Buffer;
  size: string | number;
  purpose?: string | null;
  created_at: string;
}): AttachmentRecord {
  return {
    id: row.id,
    vaultId: row.vault_id,
    itemId: row.item_id,
    storageKey: row.storage_key,
    encryptedKey: row.encrypted_key instanceof Uint8Array ? new Uint8Array(row.encrypted_key) : Uint8Array.from(row.encrypted_key),
    size: typeof row.size === "number" ? row.size : Number(row.size),
    purpose: row.purpose ?? null,
    createdAt: row.created_at,
  };
}

const ATTACHMENT_SELECT_COLUMNS =
  "id, vault_id, item_id, storage_key, encrypted_key, size, purpose, created_at";

type TransactionalQueryExecutor = QueryExecutor & {
  transaction?<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
};

export class AttachmentsRepository {
  private readonly db: TransactionalQueryExecutor;

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
    purpose?: string | null;
  }): Promise<AttachmentRecord> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      purpose: string | null;
      created_at: string;
    }>(
      `
        INSERT INTO attachments (id, vault_id, item_id, storage_key, encrypted_key, size, purpose)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${ATTACHMENT_SELECT_COLUMNS}
      `,
      [
        input.id,
        input.vaultId,
        input.itemId,
        input.storageKey,
        Buffer.from(input.encryptedKey),
        input.size,
        input.purpose ?? null,
      ],
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
      purpose: string | null;
      created_at: string;
    }>(
      `
        SELECT ${ATTACHMENT_SELECT_COLUMNS}
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
      purpose: string | null;
      created_at: string;
    }>(
      `
        DELETE FROM attachments
        WHERE vault_id = $1 AND item_id = $2 AND id = $3
        RETURNING ${ATTACHMENT_SELECT_COLUMNS}
      `,
      [vaultId, itemId, attachmentId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async deleteByVaultAndItem(vaultId: string, itemId: string): Promise<AttachmentRecord[]> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      purpose: string | null;
      created_at: string;
    }>(
      `
        DELETE FROM attachments
        WHERE vault_id = $1 AND item_id = $2
        RETURNING ${ATTACHMENT_SELECT_COLUMNS}
      `,
      [vaultId, itemId],
    );
    return rows.map(mapRow);
  }

  /** Remove the single item-favicon slot for a vault item (if any). */
  async deleteItemFaviconByVaultAndItem(vaultId: string, itemId: string): Promise<AttachmentRecord[]> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      purpose: string | null;
      created_at: string;
    }>(
      `
        DELETE FROM attachments
        WHERE vault_id = $1 AND item_id = $2 AND purpose = 'item-favicon'
        RETURNING ${ATTACHMENT_SELECT_COLUMNS}
      `,
      [vaultId, itemId],
    );
    return rows.map(mapRow);
  }

  /**
   * Atomically replace the item-favicon icon slot for a vault item.
   * Returns the new record and any previous slot rows (caller deletes their storage).
   */
  async replaceItemFavicon(input: {
    id: string;
    vaultId: string;
    itemId: string;
    storageKey: string;
    encryptedKey: Uint8Array;
    size: number;
  }): Promise<{ record: AttachmentRecord; replaced: AttachmentRecord[] }> {
    const run = async (db: QueryExecutor) => {
      const repo = new AttachmentsRepository(db);
      const replaced = await repo.deleteItemFaviconByVaultAndItem(input.vaultId, input.itemId);
      const record = await repo.create({
        ...input,
        purpose: "item-favicon",
      });
      return { record, replaced };
    };

    if (typeof this.db.transaction === "function") {
      return this.db.transaction(run);
    }
    return run(this.db);
  }

  async findById(attachmentId: string): Promise<AttachmentRecord | null> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      purpose: string | null;
      created_at: string;
    }>(
      `
        SELECT ${ATTACHMENT_SELECT_COLUMNS}
        FROM attachments
        WHERE id = $1
      `,
      [attachmentId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async deleteById(attachmentId: string): Promise<AttachmentRecord | null> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      purpose: string | null;
      created_at: string;
    }>(
      `
        DELETE FROM attachments
        WHERE id = $1
        RETURNING ${ATTACHMENT_SELECT_COLUMNS}
      `,
      [attachmentId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async deleteByItem(itemId: string): Promise<AttachmentRecord[]> {
    const rows = await this.db.query<{
      id: string;
      vault_id: string;
      item_id: string | null;
      storage_key: string;
      encrypted_key: Uint8Array | Buffer;
      size: string | number;
      purpose: string | null;
      created_at: string;
    }>(
      `
        DELETE FROM attachments
        WHERE item_id = $1
        RETURNING ${ATTACHMENT_SELECT_COLUMNS}
      `,
      [itemId],
    );
    return rows.map(mapRow);
  }
}
