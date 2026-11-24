import type { QueryExecutor } from "../storage/postgres.ts";

export type SharedVaultProfileRow = {
  vaultId: string;
  workspaceId: string;
  isPersonal: boolean;
  permissionsJson: unknown | null;
  hasProfileAssignment: boolean;
};

export class VaultProfileWriteGuardRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  async findVaultProfile(
    vaultId: string,
    userId: string,
  ): Promise<SharedVaultProfileRow | null> {
    const rows = await this.db.query<{
      id: string;
      workspace_id: string;
      is_personal: boolean;
      permissions_json: unknown | null;
      has_profile_assignment: boolean;
    }>(
      `
        SELECT
          v.id,
          v.workspace_id,
          v.is_personal,
          p.permissions_json,
          (vp.profile_id IS NOT NULL) AS has_profile_assignment
        FROM vaults v
        LEFT JOIN vault_profiles vp
          ON vp.vault_id = v.id
         AND vp.user_id = $2
        LEFT JOIN profiles p
          ON p.id = vp.profile_id
        WHERE v.id = $1
        LIMIT 1
      `,
      [vaultId, userId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      vaultId: row.id,
      workspaceId: row.workspace_id,
      isPersonal: Boolean(row.is_personal),
      permissionsJson: row.permissions_json,
      hasProfileAssignment: Boolean(row.has_profile_assignment),
    };
  }

  async findItemCreatorUserId(
    vaultId: string,
    itemId: string,
  ): Promise<string | null> {
    const rows = await this.db.query<{ actor_id: string }>(
      `
        SELECT actor_id::text AS actor_id
        FROM events
        WHERE vault_id = $1
          AND referenced_item_id = $2::bigint
          AND event_type = 'ITEM_CREATE'
        ORDER BY version ASC
        LIMIT 1
      `,
      [vaultId, itemId],
    );
    return rows[0]?.actor_id ?? null;
  }
}
