import { generateEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "../storage/postgres.ts";

export type WebAuthnAttachment = "platform" | "cross-platform";
export type PrimaryLoginMethod = "email" | "passkey" | "hardware_key";

export interface WebAuthnCredentialRecord {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  signCount: number;
  transports: string[];
  authenticatorAttachment: WebAuthnAttachment;
  aaguid: string | null;
  name: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface WebAuthnCredentialPublicDto {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type CredentialRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: Buffer;
  sign_count: string | number;
  transports: unknown;
  authenticator_attachment: WebAuthnAttachment;
  aaguid: string | null;
  name: string;
  backed_up: boolean;
  created_at: Date;
  last_used_at: Date | null;
};

function parseTransports(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapCredential(row: CredentialRow): WebAuthnCredentialRecord {
  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: Uint8Array.from(row.public_key),
    signCount: Number(row.sign_count),
    transports: parseTransports(row.transports),
    authenticatorAttachment: row.authenticator_attachment,
    aaguid: row.aaguid,
    name: row.name,
    backedUp: row.backed_up,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
  };
}

export function attachmentToPrimaryMethod(
  attachment: WebAuthnAttachment,
): Exclude<PrimaryLoginMethod, "email"> {
  return attachment === "platform" ? "passkey" : "hardware_key";
}

export function primaryMethodToAttachment(
  method: Exclude<PrimaryLoginMethod, "email">,
): WebAuthnAttachment {
  return method === "passkey" ? "platform" : "cross-platform";
}

export class WebAuthnCredentialsRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async listByUserId(userId: string): Promise<WebAuthnCredentialRecord[]> {
    const rows = await this.db.query<CredentialRow>(
      `
        SELECT id, user_id, credential_id, public_key, sign_count, transports,
               authenticator_attachment, aaguid, name, backed_up, created_at, last_used_at
        FROM user_webauthn_credentials
        WHERE user_id = $1::bigint
        ORDER BY created_at ASC
      `,
      [userId],
    );
    return rows.map(mapCredential);
  }

  async listByUserAndAttachment(
    userId: string,
    attachment: WebAuthnAttachment,
  ): Promise<WebAuthnCredentialRecord[]> {
    const rows = await this.db.query<CredentialRow>(
      `
        SELECT id, user_id, credential_id, public_key, sign_count, transports,
               authenticator_attachment, aaguid, name, backed_up, created_at, last_used_at
        FROM user_webauthn_credentials
        WHERE user_id = $1::bigint AND authenticator_attachment = $2
        ORDER BY created_at ASC
      `,
      [userId, attachment],
    );
    return rows.map(mapCredential);
  }

  async findByCredentialId(credentialId: string): Promise<WebAuthnCredentialRecord | null> {
    const rows = await this.db.query<CredentialRow>(
      `
        SELECT id, user_id, credential_id, public_key, sign_count, transports,
               authenticator_attachment, aaguid, name, backed_up, created_at, last_used_at
        FROM user_webauthn_credentials
        WHERE credential_id = $1
      `,
      [credentialId],
    );
    return rows[0] ? mapCredential(rows[0]) : null;
  }

  async findByIdForUser(
    userId: string,
    credentialRowId: string,
  ): Promise<WebAuthnCredentialRecord | null> {
    const rows = await this.db.query<CredentialRow>(
      `
        SELECT id, user_id, credential_id, public_key, sign_count, transports,
               authenticator_attachment, aaguid, name, backed_up, created_at, last_used_at
        FROM user_webauthn_credentials
        WHERE id = $1::bigint AND user_id = $2::bigint
      `,
      [credentialRowId, userId],
    );
    return rows[0] ? mapCredential(rows[0]) : null;
  }

  async insert(input: {
    userId: string;
    credentialId: string;
    publicKey: Uint8Array;
    signCount: number;
    transports: string[];
    authenticatorAttachment: WebAuthnAttachment;
    aaguid: string | null;
    name: string;
    backedUp: boolean;
  }): Promise<WebAuthnCredentialRecord> {
    const id = generateEntityId();
    const rows = await this.db.query<CredentialRow>(
      `
        INSERT INTO user_webauthn_credentials (
          id, user_id, credential_id, public_key, sign_count, transports,
          authenticator_attachment, aaguid, name, backed_up
        )
        VALUES ($1, $2::bigint, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
        RETURNING id, user_id, credential_id, public_key, sign_count, transports,
                  authenticator_attachment, aaguid, name, backed_up, created_at, last_used_at
      `,
      [
        id,
        input.userId,
        input.credentialId,
        Buffer.from(input.publicKey),
        input.signCount,
        JSON.stringify(input.transports),
        input.authenticatorAttachment,
        input.aaguid,
        input.name,
        input.backedUp,
      ],
    );
    return mapCredential(rows[0]);
  }

  async updateSignCount(credentialRowId: string, signCount: number): Promise<void> {
    await this.db.query(
      `
        UPDATE user_webauthn_credentials
        SET sign_count = $2, last_used_at = now()
        WHERE id = $1::bigint
      `,
      [credentialRowId, signCount],
    );
  }

  async deleteByIdForUser(userId: string, credentialRowId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `
        DELETE FROM user_webauthn_credentials
        WHERE id = $1::bigint AND user_id = $2::bigint
        RETURNING id
      `,
      [credentialRowId, userId],
    );
    return Boolean(rows[0]);
  }

  async deleteByAttachment(
    userId: string,
    attachment: WebAuthnAttachment,
  ): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      `
        DELETE FROM user_webauthn_credentials
        WHERE user_id = $1::bigint AND authenticator_attachment = $2
        RETURNING id
      `,
      [userId, attachment],
    );
    return rows.length;
  }

  async getPrimaryLoginMethod(userId: string): Promise<PrimaryLoginMethod> {
    const rows = await this.db.query<{ primary_login_method: string }>(
      "SELECT primary_login_method FROM users WHERE id = $1::bigint",
      [userId],
    );
    const value = rows[0]?.primary_login_method;
    if (value === "passkey" || value === "hardware_key" || value === "email") {
      return value;
    }
    return "email";
  }

  async setPrimaryLoginMethod(userId: string, primary: PrimaryLoginMethod): Promise<void> {
    await this.db.query(
      `
        UPDATE users
        SET primary_login_method = $2, updated_at = now()
        WHERE id = $1::bigint
      `,
      [userId, primary],
    );
  }
}

export function toPublicCredentialDto(
  record: WebAuthnCredentialRecord,
): WebAuthnCredentialPublicDto {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  };
}
