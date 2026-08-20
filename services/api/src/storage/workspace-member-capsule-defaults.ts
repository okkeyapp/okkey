import { generateEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "./postgres.ts";

export type CapsuleDefaultsType = "text" | "file" | "item";

export type WorkspaceMemberCapsuleDefaultsRecord = {
  workspaceId: string;
  userId: string;
  capsuleType: CapsuleDefaultsType;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type DefaultsRow = {
  workspace_id: string;
  user_id: string;
  capsule_type: string;
  settings: unknown;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DefaultsRow): WorkspaceMemberCapsuleDefaultsRecord {
  const settings =
    row.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    capsuleType: row.capsule_type as CapsuleDefaultsType,
    settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WorkspaceMemberCapsuleDefaultsRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async list(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberCapsuleDefaultsRecord[]> {
    const rows = await this.db.query<DefaultsRow>(
      `
        SELECT workspace_id, user_id, capsule_type, settings, created_at, updated_at
        FROM workspace_member_capsule_defaults
        WHERE workspace_id = $1 AND user_id = $2
        ORDER BY capsule_type ASC
      `,
      [workspaceId, userId],
    );
    return rows.map(mapRow);
  }

  async find(
    workspaceId: string,
    userId: string,
    capsuleType: CapsuleDefaultsType,
  ): Promise<WorkspaceMemberCapsuleDefaultsRecord | null> {
    const rows = await this.db.query<DefaultsRow>(
      `
        SELECT workspace_id, user_id, capsule_type, settings, created_at, updated_at
        FROM workspace_member_capsule_defaults
        WHERE workspace_id = $1 AND user_id = $2 AND capsule_type = $3
      `,
      [workspaceId, userId, capsuleType],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async upsert(input: {
    workspaceId: string;
    userId: string;
    capsuleType: CapsuleDefaultsType;
    settings: Record<string, unknown>;
  }): Promise<WorkspaceMemberCapsuleDefaultsRecord> {
    const id = generateEntityId();
    const rows = await this.db.query<DefaultsRow>(
      `
        INSERT INTO workspace_member_capsule_defaults (
          id,
          workspace_id,
          user_id,
          capsule_type,
          settings
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (workspace_id, user_id, capsule_type)
        DO UPDATE SET
          settings = EXCLUDED.settings,
          updated_at = now()
        RETURNING workspace_id, user_id, capsule_type, settings, created_at, updated_at
      `,
      [
        id,
        input.workspaceId,
        input.userId,
        input.capsuleType,
        JSON.stringify(input.settings),
      ],
    );
    return mapRow(rows[0]);
  }
}
