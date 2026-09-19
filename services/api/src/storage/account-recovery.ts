import type { EncryptedBlobDto } from "@okkey/types";
import { entityIdFromDb } from "../entity-id.ts";
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

type WrapRow = {
  user_id: string | number;
  encrypted_blob: unknown;
  created_at: string;
  rotated_at: string | null;
  exported_at: string | null;
};

type SettingsRow = {
  user_id: string | number;
  key_enabled: boolean;
  devices_enabled: boolean;
  contacts_enabled: boolean;
  updated_at: string;
};

type ContactRow = {
  id: string | number;
  user_id: string | number;
  contact_email: string;
  contact_user_id: string | number | null;
  status: TrustedContactStatus;
  created_at: string;
  confirmed_at: string | null;
};

function parseEncryptedBlob(value: unknown): EncryptedBlobDto {
  if (typeof value === "string") {
    return JSON.parse(value) as EncryptedBlobDto;
  }
  return value as EncryptedBlobDto;
}

function mapWrap(row: WrapRow): RecoveryWrapRecord {
  return {
    userId: entityIdFromDb(row.user_id),
    encryptedBlob: parseEncryptedBlob(row.encrypted_blob),
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
    exportedAt: row.exported_at,
  };
}

function mapSettings(row: SettingsRow): RecoverySettingsRecord {
  return {
    userId: entityIdFromDb(row.user_id),
    keyEnabled: row.key_enabled,
    devicesEnabled: row.devices_enabled,
    contactsEnabled: row.contacts_enabled,
    updatedAt: row.updated_at,
  };
}

function mapContact(row: ContactRow): TrustedContactRecord {
  return {
    id: entityIdFromDb(row.id),
    userId: entityIdFromDb(row.user_id),
    contactEmail: row.contact_email,
    contactUserId: row.contact_user_id == null ? null : entityIdFromDb(row.contact_user_id),
    status: row.status,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

export class AccountRecoveryRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async getWrap(userId: string): Promise<RecoveryWrapRecord | null> {
    const rows = await this.db.query<WrapRow>(
      `
        SELECT user_id, encrypted_blob, created_at, rotated_at, exported_at
        FROM user_vault_recovery_wrap
        WHERE user_id = $1::bigint
      `,
      [userId],
    );
    const row = rows[0];
    return row ? mapWrap(row) : null;
  }

  async upsertWrap(userId: string, encryptedBlob: EncryptedBlobDto, rotated: boolean): Promise<RecoveryWrapRecord> {
    const rows = await this.db.query<WrapRow>(
      `
        INSERT INTO user_vault_recovery_wrap (user_id, encrypted_blob, rotated_at, exported_at)
        VALUES ($1::bigint, $2::jsonb, CASE WHEN $3 THEN now() ELSE NULL END, NULL)
        ON CONFLICT (user_id) DO UPDATE SET
          encrypted_blob = EXCLUDED.encrypted_blob,
          rotated_at = now(),
          exported_at = NULL
        RETURNING user_id, encrypted_blob, created_at, rotated_at, exported_at
      `,
      [userId, JSON.stringify(encryptedBlob), rotated],
    );
    return mapWrap(rows[0]!);
  }

  async markExported(userId: string): Promise<RecoveryWrapRecord | null> {
    const rows = await this.db.query<WrapRow>(
      `
        UPDATE user_vault_recovery_wrap
        SET exported_at = now()
        WHERE user_id = $1::bigint
        RETURNING user_id, encrypted_blob, created_at, rotated_at, exported_at
      `,
      [userId],
    );
    const row = rows[0];
    return row ? mapWrap(row) : null;
  }

  async deleteWrap(userId: string): Promise<void> {
    await this.db.query(`DELETE FROM user_vault_recovery_wrap WHERE user_id = $1::bigint`, [userId]);
  }

  async getSettings(userId: string): Promise<RecoverySettingsRecord | null> {
    const rows = await this.db.query<SettingsRow>(
      `
        SELECT user_id, key_enabled, devices_enabled, contacts_enabled, updated_at
        FROM user_recovery_settings
        WHERE user_id = $1::bigint
      `,
      [userId],
    );
    const row = rows[0];
    return row ? mapSettings(row) : null;
  }

  async upsertSettings(
    userId: string,
    input: {
      keyEnabled: boolean;
      devicesEnabled: boolean;
      contactsEnabled: boolean;
    },
  ): Promise<RecoverySettingsRecord> {
    const rows = await this.db.query<SettingsRow>(
      `
        INSERT INTO user_recovery_settings (user_id, key_enabled, devices_enabled, contacts_enabled)
        VALUES ($1::bigint, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET
          key_enabled = EXCLUDED.key_enabled,
          devices_enabled = EXCLUDED.devices_enabled,
          contacts_enabled = EXCLUDED.contacts_enabled,
          updated_at = now()
        RETURNING user_id, key_enabled, devices_enabled, contacts_enabled, updated_at
      `,
      [userId, input.keyEnabled, input.devicesEnabled, input.contactsEnabled],
    );
    return mapSettings(rows[0]!);
  }

  async listContacts(userId: string): Promise<TrustedContactRecord[]> {
    const rows = await this.db.query<ContactRow>(
      `
        SELECT id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
        FROM user_trusted_contacts
        WHERE user_id = $1::bigint
        ORDER BY created_at ASC
      `,
      [userId],
    );
    return rows.map(mapContact);
  }

  async countConfirmedContacts(userId: string): Promise<number> {
    const rows = await this.db.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM user_trusted_contacts
        WHERE user_id = $1::bigint AND status = 'confirmed'
      `,
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async findContactByEmail(userId: string, email: string): Promise<TrustedContactRecord | null> {
    const rows = await this.db.query<ContactRow>(
      `
        SELECT id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
        FROM user_trusted_contacts
        WHERE user_id = $1::bigint AND lower(contact_email) = lower($2)
      `,
      [userId, email],
    );
    const row = rows[0];
    return row ? mapContact(row) : null;
  }

  async insertContact(input: {
    id: string;
    userId: string;
    contactEmail: string;
    contactUserId: string;
  }): Promise<TrustedContactRecord> {
    const rows = await this.db.query<ContactRow>(
      `
        INSERT INTO user_trusted_contacts (id, user_id, contact_email, contact_user_id, status)
        VALUES ($1::bigint, $2::bigint, $3, $4::bigint, 'pending')
        RETURNING id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
      `,
      [input.id, input.userId, input.contactEmail, input.contactUserId],
    );
    return mapContact(rows[0]!);
  }

  async deleteContact(userId: string, contactId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string | number }>(
      `
        DELETE FROM user_trusted_contacts
        WHERE user_id = $1::bigint AND id = $2::bigint
        RETURNING id
      `,
      [userId, contactId],
    );
    return Boolean(rows[0]);
  }

  async listPendingInvitesForContact(contactUserId: string): Promise<TrustedContactInviteRecord[]> {
    const rows = await this.db.query<{
      id: string | number;
      user_id: string | number;
      contact_email: string;
      contact_user_id: string | number;
      owner_email: string;
      created_at: string;
    }>(
      `
        SELECT c.id, c.user_id, c.contact_email, c.contact_user_id, u.email AS owner_email, c.created_at
        FROM user_trusted_contacts c
        INNER JOIN users u ON u.id = c.user_id
        WHERE c.contact_user_id = $1::bigint AND c.status = 'pending'
        ORDER BY c.created_at ASC
      `,
      [contactUserId],
    );
    return rows.map((row) => ({
      id: entityIdFromDb(row.id),
      userId: entityIdFromDb(row.user_id),
      contactEmail: row.contact_email,
      contactUserId: entityIdFromDb(row.contact_user_id),
      ownerEmail: row.owner_email,
      createdAt: row.created_at,
    }));
  }

  async confirmInvite(contactUserId: string, inviteId: string): Promise<TrustedContactRecord | null> {
    const rows = await this.db.query<ContactRow>(
      `
        UPDATE user_trusted_contacts
        SET status = 'confirmed', confirmed_at = now()
        WHERE id = $1::bigint AND contact_user_id = $2::bigint AND status = 'pending'
        RETURNING id, user_id, contact_email, contact_user_id, status, created_at, confirmed_at
      `,
      [inviteId, contactUserId],
    );
    const row = rows[0];
    return row ? mapContact(row) : null;
  }

  /** Invitee declines a pending trusted-contact invitation (removes the pending row). */
  async rejectInvite(contactUserId: string, inviteId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string | number }>(
      `
        DELETE FROM user_trusted_contacts
        WHERE id = $1::bigint AND contact_user_id = $2::bigint AND status = 'pending'
        RETURNING id
      `,
      [inviteId, contactUserId],
    );
    return Boolean(rows[0]);
  }
}
