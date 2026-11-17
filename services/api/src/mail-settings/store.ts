import type { QueryExecutor } from "../storage/postgres.ts";
import type { ServerMailSettingsRow, ServerMailSettingsStore } from "./types.ts";
import { isSmtpTlsMode } from "./validate.ts";

type DbRow = {
  smtp_host: string | null;
  smtp_port: number | string | null;
  smtp_tls_mode: string | null;
  smtp_username: string | null;
  smtp_password_ciphertext: Buffer | Uint8Array | null;
  email_from: string | null;
  public_app_url: string | null;
  smtp_verified_at: Date | string | null;
  smtp_legacy_probed_at: Date | string | null;
  updated_by: string | null;
};

function mapVerifiedAt(value: Date | string | null): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapRow(row: DbRow): ServerMailSettingsRow {
  const portRaw = row.smtp_port;
  const port =
    portRaw === null || portRaw === undefined
      ? null
      : typeof portRaw === "number"
        ? portRaw
        : Number(portRaw);
  const tls = row.smtp_tls_mode && isSmtpTlsMode(row.smtp_tls_mode) ? row.smtp_tls_mode : null;
  const ciphertext = row.smtp_password_ciphertext;
  return {
    smtpHost: row.smtp_host,
    smtpPort: port !== null && Number.isInteger(port) ? port : null,
    smtpTlsMode: tls,
    smtpUsername: row.smtp_username,
    smtpPasswordCiphertext:
      ciphertext && ciphertext.length > 0 ? Buffer.from(ciphertext) : null,
    emailFrom: row.email_from,
    publicAppUrl: row.public_app_url,
    smtpVerifiedAt: mapVerifiedAt(row.smtp_verified_at),
    smtpLegacyProbedAt: mapVerifiedAt(row.smtp_legacy_probed_at),
    updatedBy: row.updated_by,
  };
}

export class PostgresServerMailSettingsStore implements ServerMailSettingsStore {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async read(): Promise<ServerMailSettingsRow | null> {
    const rows = await this.db.query<DbRow>(
      `
        SELECT smtp_host, smtp_port, smtp_tls_mode, smtp_username,
               smtp_password_ciphertext, email_from, public_app_url,
               smtp_verified_at, smtp_legacy_probed_at, updated_by
        FROM server_mail_settings
        WHERE id = TRUE
      `,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async write(row: ServerMailSettingsRow, updatedBy: string): Promise<void> {
    await this.db.query(
      `
        INSERT INTO server_mail_settings (
          id, smtp_host, smtp_port, smtp_tls_mode, smtp_username,
          smtp_password_ciphertext, email_from, public_app_url,
          smtp_verified_at, smtp_legacy_probed_at, updated_by
        ) VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          smtp_host = EXCLUDED.smtp_host,
          smtp_port = EXCLUDED.smtp_port,
          smtp_tls_mode = EXCLUDED.smtp_tls_mode,
          smtp_username = EXCLUDED.smtp_username,
          smtp_password_ciphertext = EXCLUDED.smtp_password_ciphertext,
          email_from = EXCLUDED.email_from,
          public_app_url = EXCLUDED.public_app_url,
          smtp_verified_at = EXCLUDED.smtp_verified_at,
          smtp_legacy_probed_at = EXCLUDED.smtp_legacy_probed_at,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      `,
      [
        row.smtpHost,
        row.smtpPort,
        row.smtpTlsMode,
        row.smtpUsername,
        row.smtpPasswordCiphertext,
        row.emailFrom,
        row.publicAppUrl,
        row.smtpVerifiedAt,
        row.smtpLegacyProbedAt,
        updatedBy,
      ],
    );
  }

  async claimLegacySmtpProbe(probedAt: string): Promise<ServerMailSettingsRow | null> {
    const rows = await this.db.query<DbRow>(
      `
        UPDATE server_mail_settings
        SET smtp_legacy_probed_at = $1
        WHERE id = TRUE
          AND smtp_legacy_probed_at IS NULL
          AND smtp_verified_at IS NULL
          AND smtp_host IS NOT NULL
          AND btrim(smtp_host) <> ''
        RETURNING smtp_host, smtp_port, smtp_tls_mode, smtp_username,
                  smtp_password_ciphertext, email_from, public_app_url,
                  smtp_verified_at, smtp_legacy_probed_at, updated_by
      `,
      [probedAt],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async markLegacySmtpVerified(input: {
    verifiedAt: string;
    probedAt: string;
    smtpHost: string;
  }): Promise<boolean> {
    const rows = await this.db.query<{ ok: boolean }>(
      `
        UPDATE server_mail_settings
        SET smtp_verified_at = $1
        WHERE id = TRUE
          AND smtp_verified_at IS NULL
          AND smtp_legacy_probed_at = $2
          AND smtp_host = $3
        RETURNING TRUE AS ok
      `,
      [input.verifiedAt, input.probedAt, input.smtpHost],
    );
    return rows.length > 0;
  }
}
