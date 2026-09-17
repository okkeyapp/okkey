import type { EncryptedBlobDto } from "@okkey/types";
import type { QueryExecutor } from "./postgres.ts";

export type TrustedContactStatus = "pending" | "confirmed";

export interface RecoveryWrapRecord {
  userId: string;
  encryptedBlob: EncryptedBlobDto;
  createdAt: string;
  rotatedAt: string | null;
  exportedAt: string | null;
}

export interface RecoverySettingsRecord {
  userId: string;
  keyEnabled: boolean;
  devicesEnabled: boolean;
  contactsEnabled: boolean;
  updatedAt: string;
}

export interface TrustedContactRecord {
  id: string;
  userId: string;
  contactEmail: string;
  contactUserId: string | null;
  status: TrustedContactStatus;
  createdAt: string;
  confirmedAt: string | null;
}

export interface TrustedContactInviteRecord {
  id: string;
  userId: string;
  contactEmail: string;
  contactUserId: string;
  ownerEmail: string;
  createdAt: string;
}

function parseEncryptedBlob(value: unknown): EncryptedBlobDto {
  if (typeof value === "string") {
    return JSON.parse(value) as EncryptedBlobDto;
  }
  return value as EncryptedBlobDto;
}

export class AccountRecoveryRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async getWrap(userId: string): Promise<RecoveryWrapRecord | null> {
    const rows = await this.db.query<{
      user_id: string;
      encrypted_blob: unknown;
      created_at: string;
      rotated_at: string | null;
      exported_at: string | null;
    }>(
      `
        SELECT user_id, encrypted_blob, created_at, rotated_at, exported_at
        FROM user_vault_recovery_wrap
        WHERE user_id = $1
      `,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      encryptedBlob: parseEncryptedBlob(row.encrypted_blob),
      createdAt: row.created_at,
      rotatedAt: row.rotated_at,
      exportedAt: row.exported_at,
    };
  }

  async upsertWrap(userId: string, encryptedBlob: EncryptedBlobDto, rotated: boolean): Promise<RecoveryWrapRecord> {
    const rows = await this.db.query<{
      user_id: string;
      encrypted_blob: unknown;
      created_at: string;
      rotated_at: string | null;
      exported_at: string | null;
    }>(
      `
        INSERT INTO user_vault_recovery_wrap (user_id, encrypted_blob, rotated_at, exported_at)
        VALUES ($1, $2::jsonb, CASE WHEN $3 THEN now() ELSE NULL END, NULL)
        ON CONFLICT (user_id) DO UPDATE SET
          encrypted_blob = EXCLUDED.encrypted_blob,
          rotated_at = now(),
          exported_at = NULL
        RETURNING user_id, encrypted_blob, created_at, rotated_at, exported_at
      `,
      [userId, JSON.stringify(encryptedBlob), rotated],
    );
    const row = rows[0]!;
    return {
      userId: row.user_id,
      encryptedBlob: parseEncryptedBlob(row.encrypted_blob),
      createdAt: row.created_at,
      rotatedAt: row.rotated_at,
      exportedAt: row.exported_at,
    };
  }

  async markExported(userId: string): Promise<RecoveryWrapRecord | null> {
    const rows = await this.db.query<{
      user_id: string;
      encrypted_blob: unknown;
      created_at: string;
      rotated_at: string | null;
      exported_at: string | null;
    }>(
      `
        UPDATE user_vault_recovery_wrap
        SET exported_at = now()
        WHERE user_id = $1
        RETURNING user_id, encrypted_blob, created_at, rotated_at, exported_at
      `,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      encryptedBlob: parseEncryptedBlob(row.encrypted_blob),
      createdAt: row.created_at,
      rotatedAt: row.rotated_at,
      exportedAt: row.exported_at,
    };
  }

  async deleteWrap(userId: string): Promise<void> {
    await this.db.query(`DELETE FROM user_vault_recovery_wrap WHERE user_id = $1`, [userId]);
  }

  async getSettings(userId: string): Promise<RecoverySettingsRecord | null> {
    const rows = await this.db.query<{
      user_id: string;
      key_enabled: boolean;
      devices_enabled: boolean;
      contacts_enabled: boolean;
      updated_at: string;
    }>(
      `
        SELECT user_id, key_enabled, devices_enabled, contacts_enabled, updated_at
        FROM user_recovery_settings
        WHERE user_id = $1
      `,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      keyEnabled: row.key_enabled,
      devicesEnabled: row.devices_enabled,
      contactsEnabled: row.contacts_enabled,
      updatedAt: row.updated_at,
    };
  }

  async upsertSettings(
    userId: string,
    input: {
      keyEnabled: boolean;
      devicesEnabled: boolean;
      contactsEnabled: boolean;
    },
  ): Promise<RecoverySettingsRecord> {
    const rows = await this.db.query<{
      user_id: string;
      key_enabled: boolean;
      devices_enabled: boolean;
      contacts_enabled: boolean;
      updated_at: string;
    }>(
      `
        INSERT INTO user_recovery_settings (user_id, key_enabled, devices_enabled, contacts_enabled)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET
          key_enabled = EXCLUDED.key_enabled,
          devices_enabled = EXCLUDED.devices_enabled,
          contacts_enabled = EXCLUDED.contacts_enabled,
          updated_at = now()
        RETURNING user_id, key_enabled, devices_enabled, contacts_enabled, updated_at
      `,
      [userId, input.keyEnabled, input.devicesEnabled, input.contactsEnabled],
    );
    const row = rows[0]!;
    return {
      userId: row.user_id,
      keyEnabled: row.key_enabled,
      devicesEnabled: row.devices_enabled,
      contactsEnabled: row.contacts_enabled,
      updatedAt: row.updated_at,
    };
  }

  async listContacts(userId: string): Promise<TrustedContactRecord[]> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      contact_email: string;
      contact_user_id: string | null;
      status: TrustedContactStatus;
      created_at: string;
      confirmed_at: string | null;
    }>(
      `
        SELECT id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
        FROM user_trusted_contacts
        WHERE user_id = $1
        ORDER BY created_at ASC
      `,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      contactEmail: row.contact_email,
      contactUserId: row.contact_user_id,
      status: row.status,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    }));
  }

  async countConfirmedContacts(userId: string): Promise<number> {
    const rows = await this.db.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM user_trusted_contacts
        WHERE user_id = $1 AND status = 'confirmed'
      `,
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async findContactByEmail(userId: string, email: string): Promise<TrustedContactRecord | null> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      contact_email: string;
      contact_user_id: string | null;
      status: TrustedContactStatus;
      created_at: string;
      confirmed_at: string | null;
    }>(
      `
        SELECT id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
        FROM user_trusted_contacts
        WHERE user_id = $1 AND contact_email = $2
      `,
      [userId, email],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      contactEmail: row.contact_email,
      contactUserId: row.contact_user_id,
      status: row.status,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    };
  }

  async insertContact(input: {
    id: string;
    userId: string;
    contactEmail: string;
    contactUserId: string;
  }): Promise<TrustedContactRecord> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      contact_email: string;
      contact_user_id: string | null;
      status: TrustedContactStatus;
      created_at: string;
      confirmed_at: string | null;
    }>(
      `
        INSERT INTO user_trusted_contacts (id, user_id, contact_email, contact_user_id, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
      `,
      [input.id, input.userId, input.contactEmail, input.contactUserId],
    );
    const row = rows[0]!;
    return {
      id: row.id,
      userId: row.user_id,
      contactEmail: row.contact_email,
      contactUserId: row.contact_user_id,
      status: row.status,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    };
  }

  async deleteContact(userId: string, contactId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `
        DELETE FROM user_trusted_contacts
        WHERE user_id = $1 AND id = $2
        RETURNING id
      `,
      [userId, contactId],
    );
    return Boolean(rows[0]);
  }

  async listPendingInvitesForContact(contactUserId: string): Promise<TrustedContactInviteRecord[]> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      contact_email: string;
      contact_user_id: string;
      owner_email: string;
      created_at: string;
    }>(
      `
        SELECT c.id, c.user_id, c.contact_email, c.contact_user_id, u.email AS owner_email, c.created_at
        FROM user_trusted_contacts c
        INNER JOIN users u ON u.id = c.user_id
        WHERE c.contact_user_id = $1 AND c.status = 'pending'
        ORDER BY c.created_at ASC
      `,
      [contactUserId],
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      contactEmail: row.contact_email,
      contactUserId: row.contact_user_id,
      ownerEmail: row.owner_email,
      createdAt: row.created_at,
    }));
  }

  async confirmInvite(contactUserId: string, inviteId: string): Promise<TrustedContactRecord | null> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      contact_email: string;
      contact_user_id: string | null;
      status: TrustedContactStatus;
      created_at: string;
      confirmed_at: string | null;
    }>(
      `
        UPDATE user_trusted_contacts
        SET status = 'confirmed', confirmed_at = now()
        WHERE id = $1 AND contact_user_id = $2 AND status = 'pending'
        RETURNING id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
      `,
      [inviteId, contactUserId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      contactEmail: row.contact_email,
      contactUserId: row.contact_user_id,
      status: row.status,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    };
  }
}
