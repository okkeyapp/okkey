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

function mapRow(row: {
  registration_mode: string;
  setup_completed_at: string | Date | null;
  workspace_id: string | null;
  updated_at: string | Date;
}): ServerInstanceSettingsRow {
  return {
    registrationMode: row.registration_mode === "invite_only" ? "invite_only" : "open",
    setupCompletedAt: toIso(row.setup_completed_at),
    workspaceId: row.workspace_id == null ? null : String(row.workspace_id),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
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
      workspace_id: string | null;
      updated_at: string | Date;
    }>(
      `
        SELECT registration_mode, setup_completed_at, workspace_id, updated_at
        FROM server_instance_settings
        WHERE id = TRUE
        LIMIT 1
      `,
    );
    const row = rows[0];
    if (!row) {
      return {
        registrationMode: "invite_only",
        setupCompletedAt: null,
        workspaceId: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return mapRow(row);
  }

  async writeRegistrationMode(mode: RegistrationMode): Promise<ServerInstanceSettingsRow> {
    if (mode === "open") {
      throw new Error("open registration is not available on self-hosted instances");
    }
    const rows = await this.db.query<{
      registration_mode: string;
      setup_completed_at: string | Date | null;
      workspace_id: string | null;
      updated_at: string | Date;
    }>(
      `
        UPDATE server_instance_settings
        SET registration_mode = $1, updated_at = now()
        WHERE id = TRUE
        RETURNING registration_mode, setup_completed_at, workspace_id, updated_at
      `,
      [mode],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("server_instance_settings row missing");
    }
    return mapRow(row);
  }

  async markSetupCompleted(completedAt: string): Promise<ServerInstanceSettingsRow> {
    const rows = await this.db.query<{
      registration_mode: string;
      setup_completed_at: string | Date | null;
      workspace_id: string | null;
      updated_at: string | Date;
    }>(
      `
        UPDATE server_instance_settings
        SET setup_completed_at = COALESCE(setup_completed_at, $1::timestamptz),
            registration_mode = 'invite_only',
            updated_at = now()
        WHERE id = TRUE
        RETURNING registration_mode, setup_completed_at, workspace_id, updated_at
      `,
      [completedAt],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("server_instance_settings row missing");
    }
    return mapRow(row);
  }

  async markSetupCompletedWithWorkspace(
    completedAt: string,
    workspaceId: string,
  ): Promise<ServerInstanceSettingsRow> {
    const rows = await this.db.query<{
      registration_mode: string;
      setup_completed_at: string | Date | null;
      workspace_id: string | null;
      updated_at: string | Date;
    }>(
      `
        UPDATE server_instance_settings
        SET setup_completed_at = COALESCE(setup_completed_at, $1::timestamptz),
            workspace_id = COALESCE(workspace_id, $2::bigint),
            registration_mode = 'invite_only',
            updated_at = now()
        WHERE id = TRUE
        RETURNING registration_mode, setup_completed_at, workspace_id, updated_at
      `,
      [completedAt, workspaceId],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("server_instance_settings row missing");
    }
    return mapRow(row);
  }
}
