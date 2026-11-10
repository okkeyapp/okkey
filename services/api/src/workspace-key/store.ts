import type { EncryptedBlob } from "../crypto/encrypted-blob.ts";
import {
  decodeEncryptedBlobFromStorage,
  serializeEncryptedBlobToStorage,
} from "../crypto/encrypted-blob.ts";
import type { QueryExecutor } from "../storage/postgres.ts";

export type WorkspaceKeyWrapRecord = {
  userId: string;
  keyVersion: number;
  encryptedWorkspaceKey: EncryptedBlob;
};

export type WorkspaceLogoRecord = {
  keyVersion: number;
  ciphertext: Uint8Array;
  ciphertextBytes: number;
  updatedAt: string;
};

export type WorkspaceClientSettingsRecord = {
  keyVersion: number;
  ciphertext: Uint8Array;
};

export interface WorkspaceKeyStore {
  currentVersion(workspaceId: string): Promise<number | null>;
  activeMemberIds(workspaceId: string): Promise<string[]>;
  wrapsForUser(workspaceId: string, userId: string): Promise<WorkspaceKeyWrapRecord[]>;
  insertWraps(workspaceId: string, wraps: WorkspaceKeyWrapRecord[]): Promise<void>;
  deleteUserWraps(workspaceId: string, userId: string): Promise<void>;
  getLogo(workspaceId: string): Promise<WorkspaceLogoRecord | null>;
  putLogo(
    workspaceId: string,
    logo: { keyVersion: number; ciphertext: Uint8Array },
  ): Promise<{ previousBytes: number; updatedAt: string }>;
  deleteLogo(workspaceId: string): Promise<number>;
  getClientSettings(workspaceId: string): Promise<WorkspaceClientSettingsRecord | null>;
  putClientSettings(
    workspaceId: string,
    input: { keyVersion: number; ciphertext: Uint8Array; tileColor?: string | null },
  ): Promise<void>;
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return Uint8Array.from(value);
  }
  throw new Error("expected bytea");
}

function asIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

export class PgWorkspaceKeyStore implements WorkspaceKeyStore {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async currentVersion(workspaceId: string): Promise<number | null> {
    const rows = await this.db.query<{ version: number | string }>(
      `
        SELECT COALESCE(MAX(key_version), 0)::int AS version
        FROM workspace_key_wraps
        WHERE workspace_id = $1
      `,
      [workspaceId],
    );
    const version = Number(rows[0]?.version ?? 0);
    return version > 0 ? version : null;
  }

  async activeMemberIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db.query<{ user_id: string }>(
      `
        SELECT owner_id AS user_id FROM workspaces WHERE id = $1
        UNION
        SELECT user_id FROM workspace_members WHERE workspace_id = $1
      `,
      [workspaceId],
    );
    return rows.map((row) => String(row.user_id));
  }

  async wrapsForUser(workspaceId: string, userId: string): Promise<WorkspaceKeyWrapRecord[]> {
    const rows = await this.db.query<{ key_version: number; encrypted_workspace_key: unknown }>(
      `
        SELECT key_version, encrypted_workspace_key
        FROM workspace_key_wraps
        WHERE workspace_id = $1 AND user_id = $2
        ORDER BY key_version
      `,
      [workspaceId, userId],
    );
    return rows.map((row) => ({
      userId,
      keyVersion: Number(row.key_version),
      encryptedWorkspaceKey: decodeEncryptedBlobFromStorage(asBytes(row.encrypted_workspace_key)),
    }));
  }

  async insertWraps(workspaceId: string, wraps: WorkspaceKeyWrapRecord[]): Promise<void> {
    for (const wrap of wraps) {
      await this.db.query(
        `
          INSERT INTO workspace_key_wraps (workspace_id, user_id, key_version, encrypted_workspace_key)
          VALUES ($1, $2, $3, $4)
        `,
        [
          workspaceId,
          wrap.userId,
          wrap.keyVersion,
          Buffer.from(serializeEncryptedBlobToStorage(wrap.encryptedWorkspaceKey)),
        ],
      );
    }
  }

  async deleteUserWraps(workspaceId: string, userId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM workspace_key_wraps WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
  }

  async getLogo(workspaceId: string): Promise<WorkspaceLogoRecord | null> {
    const rows = await this.db.query<{
      key_version: number;
      ciphertext: unknown;
      ciphertext_bytes: number | string;
      updated_at: string | Date;
    }>(
      `
        SELECT key_version, ciphertext, ciphertext_bytes, updated_at
        FROM workspace_logos
        WHERE workspace_id = $1
      `,
      [workspaceId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    const ciphertext = asBytes(row.ciphertext);
    return {
      keyVersion: Number(row.key_version),
      ciphertext,
      ciphertextBytes: Number(row.ciphertext_bytes),
      updatedAt: asIso(row.updated_at),
    };
  }

  async putLogo(
    workspaceId: string,
    logo: { keyVersion: number; ciphertext: Uint8Array },
  ): Promise<{ previousBytes: number; updatedAt: string }> {
    const previous = await this.getLogo(workspaceId);
    const rows = await this.db.query<{ updated_at: string | Date }>(
      `
        INSERT INTO workspace_logos (workspace_id, key_version, ciphertext, ciphertext_bytes, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (workspace_id) DO UPDATE
          SET key_version = EXCLUDED.key_version,
              ciphertext = EXCLUDED.ciphertext,
              ciphertext_bytes = EXCLUDED.ciphertext_bytes,
              updated_at = now()
        RETURNING updated_at
      `,
      [workspaceId, logo.keyVersion, Buffer.from(logo.ciphertext), logo.ciphertext.length],
    );
    await this.db.query(
      `
        UPDATE workspaces
        SET logo_key_version = $2,
            logo_updated_at = $3,
            logo_vault_id = NULL,
            logo_attachment_id = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [workspaceId, logo.keyVersion, rows[0]?.updated_at ?? new Date().toISOString()],
    );
    return {
      previousBytes: previous?.ciphertextBytes ?? 0,
      updatedAt: rows[0] ? asIso(rows[0].updated_at) : new Date().toISOString(),
    };
  }

  async deleteLogo(workspaceId: string): Promise<number> {
    const previous = await this.getLogo(workspaceId);
    await this.db.query(`DELETE FROM workspace_logos WHERE workspace_id = $1`, [workspaceId]);
    await this.db.query(
      `
        UPDATE workspaces
        SET logo_key_version = NULL,
            logo_updated_at = NULL,
            logo_vault_id = NULL,
            logo_attachment_id = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [workspaceId],
    );
    return previous?.ciphertextBytes ?? 0;
  }

  async getClientSettings(workspaceId: string): Promise<WorkspaceClientSettingsRecord | null> {
    const rows = await this.db.query<{
      client_settings_key_version: number | null;
      client_settings_ciphertext: unknown;
    }>(
      `
        SELECT client_settings_key_version, client_settings_ciphertext
        FROM workspaces
        WHERE id = $1
      `,
      [workspaceId],
    );
    const row = rows[0];
    if (!row?.client_settings_key_version || row.client_settings_ciphertext == null) {
      return null;
    }
    return {
      keyVersion: Number(row.client_settings_key_version),
      ciphertext: asBytes(row.client_settings_ciphertext),
    };
  }

  async putClientSettings(
    workspaceId: string,
    input: { keyVersion: number; ciphertext: Uint8Array; tileColor?: string | null },
  ): Promise<void> {
    if (input.tileColor !== undefined) {
      await this.db.query(
        `
          UPDATE workspaces
          SET client_settings_key_version = $2,
              client_settings_ciphertext = $3,
              tile_color = $4,
              updated_at = now()
          WHERE id = $1
        `,
        [workspaceId, input.keyVersion, Buffer.from(input.ciphertext), input.tileColor],
      );
      return;
    }
    await this.db.query(
      `
        UPDATE workspaces
        SET client_settings_key_version = $2,
            client_settings_ciphertext = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [workspaceId, input.keyVersion, Buffer.from(input.ciphertext)],
    );
  }
}
