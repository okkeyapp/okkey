import { generateEntityId } from "../entity-id.ts";
import type { QueryExecutor } from "./postgres.ts";

export type WorkspaceRoleRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  permissionsJson: Record<string, unknown>;
  isSystem: boolean;
  builtinKey: string | null;
  memberCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type RoleRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  permissions_json: Record<string, unknown>;
  is_system: boolean;
  builtin_key: string | null;
  member_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const ROLE_SELECT = `
  r.id,
  r.workspace_id,
  r.name,
  r.description,
  r.permissions_json,
  r.is_system,
  r.builtin_key,
  COALESCE(mc.member_count, 0)::int AS member_count,
  r.created_by,
  r.created_at,
  r.updated_at
`;

const MEMBER_COUNT_JOIN = `
  LEFT JOIN (
    SELECT role_id, COUNT(*)::int AS member_count
    FROM workspace_members
    WHERE workspace_id = $1
      AND role_id IS NOT NULL
    GROUP BY role_id
  ) mc ON mc.role_id = r.id
`;

function mapRoleRow(row: RoleRow): WorkspaceRoleRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    permissionsJson: row.permissions_json,
    isSystem: row.is_system,
    builtinKey: row.builtin_key,
    memberCount: row.member_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WorkspaceRolesRepository {
  private readonly db: QueryExecutor;

  constructor(db: QueryExecutor) {
    this.db = db;
  }

  /** System roles first, then custom roles (remnants after an enterprise downgrade). */
  async listByWorkspace(workspaceId: string): Promise<WorkspaceRoleRecord[]> {
    const rows = await this.db.query<RoleRow>(
      `
        SELECT ${ROLE_SELECT}
        FROM roles r
        ${MEMBER_COUNT_JOIN}
        WHERE r.workspace_id = $1
        ORDER BY r.is_system DESC, r.builtin_key ASC NULLS LAST, r.name ASC, r.id ASC
      `,
      [workspaceId],
    );
    return rows.map(mapRoleRow);
  }

  async listBuiltInByWorkspace(workspaceId: string): Promise<WorkspaceRoleRecord[]> {
    const rows = await this.db.query<RoleRow>(
      `
        SELECT ${ROLE_SELECT}
        FROM roles r
        ${MEMBER_COUNT_JOIN}
        WHERE r.workspace_id = $1
          AND r.is_system = true
        ORDER BY r.builtin_key ASC NULLS LAST, r.name ASC, r.id ASC
      `,
      [workspaceId],
    );
    return rows.map(mapRoleRow);
  }

  async findById(workspaceId: string, roleId: string): Promise<WorkspaceRoleRecord | null> {
    const rows = await this.db.query<RoleRow>(
      `
        SELECT ${ROLE_SELECT}
        FROM roles r
        ${MEMBER_COUNT_JOIN}
        WHERE r.workspace_id = $1
          AND r.id = $2
        LIMIT 1
      `,
      [workspaceId, roleId],
    );
    return rows[0] ? mapRoleRow(rows[0]) : null;
  }

  async findByBuiltinKey(workspaceId: string, builtinKey: string): Promise<WorkspaceRoleRecord | null> {
    const rows = await this.db.query<RoleRow>(
      `
        SELECT ${ROLE_SELECT}
        FROM roles r
        ${MEMBER_COUNT_JOIN}
        WHERE r.workspace_id = $1
          AND r.builtin_key = $2
        LIMIT 1
      `,
      [workspaceId, builtinKey],
    );
    return rows[0] ? mapRoleRow(rows[0]) : null;
  }

  async reassignMembersToRole(workspaceId: string, fromRoleId: string, toRoleId: string): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      `
        WITH updated AS (
          UPDATE workspace_members
          SET role_id = $3
          WHERE workspace_id = $1
            AND role_id = $2
          RETURNING id
        )
        SELECT COUNT(*)::int AS count
        FROM updated
      `,
      [workspaceId, fromRoleId, toRoleId],
    );
    return rows[0]?.count ?? 0;
  }

  /** `workspace_invitations.role_id` is ON DELETE RESTRICT, so invitations must move before the role is dropped. */
  async reassignInvitationsToRole(workspaceId: string, fromRoleId: string, toRoleId: string): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      `
        WITH updated AS (
          UPDATE workspace_invitations
          SET role_id = $3
          WHERE workspace_id = $1
            AND role_id = $2
          RETURNING id
        )
        SELECT COUNT(*)::int AS count
        FROM updated
      `,
      [workspaceId, fromRoleId, toRoleId],
    );
    return rows[0]?.count ?? 0;
  }

  async deleteCustom(workspaceId: string, roleId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `
        DELETE FROM roles
        WHERE workspace_id = $1
          AND id = $2
          AND is_system = false
        RETURNING id
      `,
      [workspaceId, roleId],
    );
    return Boolean(rows[0]);
  }

  async ensureOwnerMembership(workspaceId: string, ownerId: string, ownerRoleId: string): Promise<void> {
    const memberId = generateEntityId();
    await this.db.query(
      `
        INSERT INTO workspace_members (id, workspace_id, user_id, role_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (workspace_id, user_id) DO UPDATE
        SET role_id = COALESCE(workspace_members.role_id, EXCLUDED.role_id)
      `,
      [memberId, workspaceId, ownerId, ownerRoleId],
    );
  }
}
