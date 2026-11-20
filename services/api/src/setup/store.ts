import type { QueryExecutor } from "../storage/postgres.ts";
import type {
  RegistrationMode,
  ServerInstanceSettingsRow,
  ServerInstanceSettingsStore,
} from "./types.ts";

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

export class PostgresServerInstanceSettingsStore implements ServerInstanceSettingsStore {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async read(): Promise<ServerInstanceSettingsRow> {
    const rows = await this.db.query<{
      registration_mode: string;
      setup_completed_at: string | Date | null;
      updated_at: string | Date;
    }>(
      `
        SELECT registration_mode, setup_completed_at, updated_at
        FROM server_instance_settings
        WHERE id = TRUE
        LIMIT 1
      `,
    );
    const row = rows[0];
    if (!row) {
      return {
        registrationMode: "open",
        setupCompletedAt: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      registrationMode: row.registration_mode === "invite_only" ? "invite_only" : "open",
      setupCompletedAt: toIso(row.setup_completed_at),
      updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    };
  }

  async writeRegistrationMode(mode: RegistrationMode): Promise<ServerInstanceSettingsRow> {
    const rows = await this.db.query<{
      registration_mode: string;
      setup_completed_at: string | Date | null;
      updated_at: string | Date;
    }>(
      `
        UPDATE server_instance_settings
        SET registration_mode = $1, updated_at = now()
        WHERE id = TRUE
        RETURNING registration_mode, setup_completed_at, updated_at
      `,
      [mode],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("server_instance_settings row missing");
    }
    return {
      registrationMode: row.registration_mode === "invite_only" ? "invite_only" : "open",
      setupCompletedAt: toIso(row.setup_completed_at),
      updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    };
  }

  async markSetupCompleted(completedAt: string): Promise<ServerInstanceSettingsRow> {
    const rows = await this.db.query<{
      registration_mode: string;
      setup_completed_at: string | Date | null;
      updated_at: string | Date;
    }>(
      `
        UPDATE server_instance_settings
        SET setup_completed_at = COALESCE(setup_completed_at, $1::timestamptz),
            updated_at = now()
        WHERE id = TRUE
        RETURNING registration_mode, setup_completed_at, updated_at
      `,
      [completedAt],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("server_instance_settings row missing");
    }
    return {
      registrationMode: row.registration_mode === "invite_only" ? "invite_only" : "open",
      setupCompletedAt: toIso(row.setup_completed_at),
      updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    };
  }
}
