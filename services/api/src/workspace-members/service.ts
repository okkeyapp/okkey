import type { QueryExecutor } from "../storage/postgres.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import {
  assertWorkspacePermission,
  type WorkspacePermissionsMatrix,
  type WorkspaceResourcePermission,
  WorkspacePermissionError,
} from "../workspace-roles/permissions.ts";
import { ensureDefaultWorkspaceRoles } from "../workspace-roles/seed.ts";

export class WorkspaceMembersServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type MemberActorRef = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type WorkspaceMemberRecord = {
  userId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  publicKey: string;
  publicPqKey: string | null;
  roleId: string | null;
  roleBuiltinKey: string | null;
  roleName: string | null;
  status: "active" | "pending";
  invitationId: string | null;
  invitedAt: string | null;
  invitedBy: MemberActorRef | null;
  roleChangedAt: string | null;
  roleChangedBy: MemberActorRef | null;
  joinedAt: string | null;
  lastLoginAt: string | null;
};

export interface WorkspaceMembersServiceDeps {
  db: QueryExecutor;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function actorFromRow(row: {
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
} | null): MemberActorRef | null {
  if (!row?.user_id || !row.email) {
    return null;
  }
  return {
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

export class WorkspaceMembersService {
  private readonly db: QueryExecutor;
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;

  constructor(deps: WorkspaceMembersServiceDeps) {
    this.db = deps.db;
    this.workspaces = deps.workspaces;
  }

  async listMembers(
    workspaceId: string,
    actorId: string,
  ): Promise<{
    members: WorkspaceMemberRecord[];
    actorPermissions: { members: WorkspaceResourcePermission };
  }> {
    await this.requireAccessibleWorkspace(workspaceId, actorId);
    const matrix = await this.assertMembers(workspaceId, actorId, "get");
    await ensureDefaultWorkspaceRoles(this.db, workspaceId, (await this.requireWorkspace(workspaceId)).ownerId);

    const active = await this.loadActiveMembers(workspaceId);
    const pending = await this.loadPendingInvitations(workspaceId);
    return {
      members: [...active, ...pending],
      actorPermissions: { members: matrix.members },
    };
  }

  private async assertMembers(
    workspaceId: string,
    actorId: string,
    action: "get" | "post" | "put" | "delete",
  ): Promise<WorkspacePermissionsMatrix> {
    try {
      return await assertWorkspacePermission(this.db, workspaceId, actorId, "members", action);
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        throw new WorkspaceMembersServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceMembersServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    return workspace;
  }

  private async requireAccessibleWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceMembersServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }

  private async loadActiveMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const rows = await this.db.query<{
      user_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      public_key: string;
      public_pq_key: string | null;
      role_id: string | null;
      role_builtin_key: string | null;
      role_name: string | null;
      joined_at: string | Date | null;
      invited_at: string | Date | null;
      role_changed_at: string | Date | null;
      invited_by_user_id: string | null;
      invited_by_email: string | null;
      invited_by_first_name: string | null;
      invited_by_last_name: string | null;
      role_changed_by_user_id: string | null;
      role_changed_by_email: string | null;
      role_changed_by_first_name: string | null;
      role_changed_by_last_name: string | null;
      last_login_at: string | Date | null;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.email,
          u.first_name,
          u.last_name,
          u.public_key,
          u.public_pq_key,
          wm.role_id,
          r.builtin_key AS role_builtin_key,
          r.name AS role_name,
          COALESCE(wm.created_at, w.created_at) AS joined_at,
          wm.invited_at,
          wm.role_changed_at,
          wm.invited_by_user_id,
          ib.email AS invited_by_email,
          ib.first_name AS invited_by_first_name,
          ib.last_name AS invited_by_last_name,
          wm.role_changed_by_user_id,
          rb.email AS role_changed_by_email,
          rb.first_name AS role_changed_by_first_name,
          rb.last_name AS role_changed_by_last_name,
          u.last_vault_unlocked_at AS last_login_at
        FROM (
          SELECT
            wm.workspace_id,
            wm.user_id,
            wm.role_id,
            wm.created_at,
            wm.invited_by_user_id,
            wm.invited_at,
            wm.role_changed_by_user_id,
            wm.role_changed_at
          FROM workspace_members wm
          WHERE wm.workspace_id = $1
          UNION ALL
          SELECT
            w.id AS workspace_id,
            w.owner_id AS user_id,
            owner_role.id AS role_id,
            w.created_at,
            NULL::bigint AS invited_by_user_id,
            NULL::timestamptz AS invited_at,
            NULL::bigint AS role_changed_by_user_id,
            NULL::timestamptz AS role_changed_at
          FROM workspaces w
          LEFT JOIN roles owner_role
            ON owner_role.workspace_id = w.id
           AND owner_role.builtin_key = 'owner'
          WHERE w.id = $1
            AND NOT EXISTS (
              SELECT 1 FROM workspace_members wm2
              WHERE wm2.workspace_id = w.id AND wm2.user_id = w.owner_id
            )
        ) wm
        JOIN workspaces w ON w.id = wm.workspace_id
        JOIN users u ON u.id = wm.user_id
        LEFT JOIN roles r ON r.id = wm.role_id
        LEFT JOIN users ib ON ib.id = wm.invited_by_user_id
        LEFT JOIN users rb ON rb.id = wm.role_changed_by_user_id
        ORDER BY
          CASE WHEN r.builtin_key = 'owner' OR u.id = w.owner_id THEN 0 ELSE 1 END,
          lower(u.email) ASC
      `,
      [workspaceId],
    );

    const seen = new Set<string>();
    const members: WorkspaceMemberRecord[] = [];
    for (const row of rows) {
      if (seen.has(row.user_id)) {
        continue;
      }
      seen.add(row.user_id);
      members.push({
        userId: row.user_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        publicKey: row.public_key,
        publicPqKey: row.public_pq_key,
        roleId: row.role_id,
        roleBuiltinKey: row.role_builtin_key,
        roleName: row.role_name,
        status: "active",
        invitationId: null,
        invitedAt: toIso(row.invited_at),
        invitedBy: actorFromRow({
          user_id: row.invited_by_user_id,
          email: row.invited_by_email,
          first_name: row.invited_by_first_name,
          last_name: row.invited_by_last_name,
        }),
        roleChangedAt: toIso(row.role_changed_at),
        roleChangedBy: actorFromRow({
          user_id: row.role_changed_by_user_id,
          email: row.role_changed_by_email,
          first_name: row.role_changed_by_first_name,
          last_name: row.role_changed_by_last_name,
        }),
        joinedAt: toIso(row.joined_at),
        lastLoginAt: toIso(row.last_login_at),
      });
    }
    return members;
  }

  private async loadPendingInvitations(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const rows = await this.db.query<{
      invitation_id: string;
      email: string;
      role_id: string;
      role_builtin_key: string | null;
      role_name: string | null;
      invited_at: string | Date;
      invited_by_user_id: string;
      invited_by_email: string;
      invited_by_first_name: string | null;
      invited_by_last_name: string | null;
      role_changed_at: string | Date | null;
      role_changed_by_user_id: string | null;
      role_changed_by_email: string | null;
      role_changed_by_first_name: string | null;
      role_changed_by_last_name: string | null;
    }>(
      `
        SELECT
          wi.id AS invitation_id,
          wi.email,
          wi.role_id,
          r.builtin_key AS role_builtin_key,
          r.name AS role_name,
          wi.created_at AS invited_at,
          wi.invited_by_user_id,
          u.email AS invited_by_email,
          u.first_name AS invited_by_first_name,
          u.last_name AS invited_by_last_name,
          wi.role_changed_at,
          wi.role_changed_by_user_id,
          rb.email AS role_changed_by_email,
          rb.first_name AS role_changed_by_first_name,
          rb.last_name AS role_changed_by_last_name
        FROM workspace_invitations wi
        JOIN roles r ON r.id = wi.role_id
        JOIN users u ON u.id = wi.invited_by_user_id
        LEFT JOIN users rb ON rb.id = wi.role_changed_by_user_id
        WHERE wi.workspace_id = $1
          AND wi.status = 'pending'
          AND wi.expires_at > now()
        ORDER BY wi.created_at DESC
      `,
      [workspaceId],
    );

    return rows.map((row) => ({
      userId: null,
      email: row.email,
      firstName: null,
      lastName: null,
      publicKey: "",
      publicPqKey: null,
      roleId: row.role_id,
      roleBuiltinKey: row.role_builtin_key,
      roleName: row.role_name,
      status: "pending" as const,
      invitationId: row.invitation_id,
      invitedAt: toIso(row.invited_at),
      invitedBy: {
        userId: row.invited_by_user_id,
        email: row.invited_by_email,
        firstName: row.invited_by_first_name,
        lastName: row.invited_by_last_name,
      },
      roleChangedAt: toIso(row.role_changed_at),
      roleChangedBy: actorFromRow({
        user_id: row.role_changed_by_user_id,
        email: row.role_changed_by_email,
        first_name: row.role_changed_by_first_name,
        last_name: row.role_changed_by_last_name,
      }),
      joinedAt: null,
      lastLoginAt: null,
    }));
  }
}
