import type { QueryExecutor } from "./postgres.ts";

export type WorkspaceProfileRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  permissionsJson: Record<string, unknown>;
  isSystem: boolean;
  builtinKey: string | null;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
};

type ProfileRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  permissions_json: Record<string, unknown>;
  is_system: boolean;
  builtin_key: string | null;
  application_count: number;
  created_at: string;
  updated_at: string;
};

const PROFILE_SELECT = `
  p.id,
  p.workspace_id,
  p.name,
  p.description,
  p.permissions_json,
  p.is_system,
  p.builtin_key,
  COALESCE(ac.application_count, 0)::int AS application_count,
  p.created_at,
  p.updated_at
`;

const APPLICATION_COUNT_JOIN = `
  LEFT JOIN (
    SELECT vp.profile_id, COUNT(*)::int AS application_count
    FROM vault_profiles vp
    INNER JOIN vaults v ON v.id = vp.vault_id
    WHERE v.workspace_id = $1
      AND vp.profile_id IS NOT NULL
    GROUP BY vp.profile_id
  ) ac ON ac.profile_id = p.id
`;

function mapProfileRow(row: ProfileRow): WorkspaceProfileRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    permissionsJson: row.permissions_json,
    isSystem: row.is_system,
    builtinKey: row.builtin_key,
    applicationCount: row.application_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WorkspaceProfilesRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async listBuiltInByWorkspace(workspaceId: string): Promise<WorkspaceProfileRecord[]> {
    const rows = await this.db.query<ProfileRow>(
      `
        SELECT ${PROFILE_SELECT}
        FROM profiles p
        ${APPLICATION_COUNT_JOIN}
        WHERE p.workspace_id = $1
          AND p.is_system = true
        ORDER BY p.builtin_key ASC NULLS LAST, p.name ASC, p.id ASC
      `,
      [workspaceId],
    );
    return rows.map(mapProfileRow);
  }

  async listMeVaultProfiles(
    workspaceId: string,
    userId: string,
  ): Promise<
    Array<{
      vaultId: string;
      isPersonal: boolean;
      profileId: string | null;
      permissionsJson: Record<string, unknown> | null;
      builtinKey: string | null;
    }>
  > {
    const rows = await this.db.query<{
      vault_id: string;
      is_personal: boolean;
      profile_id: string | null;
      permissions_json: Record<string, unknown> | null;
      builtin_key: string | null;
    }>(
      `
        SELECT
          v.id AS vault_id,
          v.is_personal,
          vp.profile_id,
          p.permissions_json,
          p.builtin_key
        FROM vaults v
        LEFT JOIN vault_profiles vp
          ON vp.vault_id = v.id
         AND vp.user_id = $2
        LEFT JOIN profiles p
          ON p.id = vp.profile_id
        WHERE v.workspace_id = $1
          AND (
            (v.is_personal = true AND v.owner_id = $2)
            OR (
              v.is_personal = false
              AND vp.profile_id IS NOT NULL
            )
          )
        ORDER BY v.is_personal DESC, v.created_at ASC
      `,
      [workspaceId, userId],
    );
    return rows.map((row) => ({
      vaultId: row.vault_id,
      isPersonal: row.is_personal,
      profileId: row.profile_id,
      permissionsJson: row.permissions_json,
      builtinKey: row.builtin_key,
    }));
  }

  async findByBuiltinKey(
    workspaceId: string,
    builtinKey: string,
  ): Promise<WorkspaceProfileRecord | null> {
    const rows = await this.db.query<ProfileRow>(
      `
        SELECT ${PROFILE_SELECT}
        FROM profiles p
        ${APPLICATION_COUNT_JOIN}
        WHERE p.workspace_id = $1
          AND p.builtin_key = $2
        LIMIT 1
      `,
      [workspaceId, builtinKey],
    );
    return rows[0] ? mapProfileRow(rows[0]) : null;
  }
}
