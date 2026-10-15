import type {
  WorkspaceBuiltInRoleDto,
  WorkspaceBuiltInRoleId,
  WorkspaceCustomRoleRemnantDto,
  WorkspaceRoleListItemDto,
} from "../../../../packages/types/src/workspace-roles.ts";
import { isEntityId } from "../entity-id.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceRoleRecord, WorkspaceRolesRepository } from "../storage/workspace-roles.ts";
import {
  assertWorkspacePermissionOnObject,
  permissionAllowsObject,
  resolveWorkspacePermissions,
  WorkspacePermissionError,
} from "./permissions.ts";
import { ensureDefaultWorkspaceRoles } from "./seed.ts";

export type { WorkspaceBuiltInRoleDto, WorkspaceCustomRoleRemnantDto, WorkspaceRoleListItemDto };

export class WorkspaceBuiltInRolesServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type WorkspaceRolesRepositoryLike = Pick<
  WorkspaceRolesRepository,
  | "listByWorkspace"
  | "findById"
  | "findByBuiltinKey"
  | "reassignMembersToRole"
  | "reassignInvitationsToRole"
  | "deleteCustom"
>;

export interface WorkspaceBuiltInRolesServiceDeps {
  roles: WorkspaceRolesRepositoryLike;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  db: QueryExecutorLike;
}

type QueryExecutorLike = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

/**
 * Open-core roles: built-in roles plus custom-role remnants left after enterprise modules were disabled.
 * Custom roles cannot be created or edited here; they can only be listed and deleted.
 */
export class WorkspaceBuiltInRolesService {
  private readonly roles: WorkspaceRolesRepositoryLike;
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  private readonly db: QueryExecutorLike;

  constructor(deps: WorkspaceBuiltInRolesServiceDeps) {
    this.roles = deps.roles;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
  }

  async list(workspaceId: string, userId: string): Promise<WorkspaceRoleListItemDto[]> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, userId);
    await ensureDefaultWorkspaceRoles(this.db, workspaceId, workspace.ownerId);
    const rows = await this.roles.listByWorkspace(workspaceId);
    const customGetLevel = rows.some((row) => !row.isSystem)
      ? await this.resolveRolesGetLevel(workspaceId, userId)
      : 0;
    return rows.flatMap((row): WorkspaceRoleListItemDto[] => {
      if (row.isSystem) {
        return isBuiltInRoleId(row.builtinKey) ? [toBuiltInRoleDto(row, row.builtinKey)] : [];
      }
      const isOwn = row.createdBy === userId;
      return permissionAllowsObject(customGetLevel, isOwn) ? [toCustomRoleRemnantDto(row)] : [];
    });
  }

  /** Not plan-gated: after downgrade, existing custom roles must remain removable. */
  async deleteCustomRole(workspaceId: string, userId: string, roleId: string): Promise<void> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, userId);

    const normalizedRoleId = roleId.trim();
    if (!isEntityId(normalizedRoleId)) {
      throw new WorkspaceBuiltInRolesServiceError("INVALID_ROLE_ID", 400, "role id is required");
    }

    const existing = await this.roles.findById(workspaceId, normalizedRoleId);
    if (!existing) {
      throw new WorkspaceBuiltInRolesServiceError("ROLE_NOT_FOUND", 404, "role not found");
    }
    if (existing.isSystem) {
      throw new WorkspaceBuiltInRolesServiceError("ROLE_NOT_MUTABLE", 403, "system roles cannot be deleted");
    }

    const isOwn = existing.createdBy === userId;
    await this.assertRolesDeleteOnObject(workspaceId, userId, isOwn);

    await ensureDefaultWorkspaceRoles(this.db, workspaceId, workspace.ownerId);
    const userRole = await this.roles.findByBuiltinKey(workspaceId, "user");
    if (!userRole) {
      throw new WorkspaceBuiltInRolesServiceError("USER_ROLE_NOT_FOUND", 500, "default user role not found");
    }

    await this.roles.reassignMembersToRole(workspaceId, normalizedRoleId, userRole.id);
    await this.roles.reassignInvitationsToRole(workspaceId, normalizedRoleId, userRole.id);

    const deleted = await this.roles.deleteCustom(workspaceId, normalizedRoleId);
    if (!deleted) {
      throw new WorkspaceBuiltInRolesServiceError("ROLE_NOT_FOUND", 404, "role not found");
    }
  }

  private async resolveRolesGetLevel(workspaceId: string, userId: string): Promise<0 | 1 | 2> {
    try {
      const matrix = await resolveWorkspacePermissions(this.db, workspaceId, userId);
      return matrix.roles.get;
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        return 0;
      }
      throw error;
    }
  }

  private async assertRolesDeleteOnObject(workspaceId: string, userId: string, isOwn: boolean) {
    try {
      await assertWorkspacePermissionOnObject(this.db, workspaceId, userId, "roles", "delete", isOwn);
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        throw new WorkspaceBuiltInRolesServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
  }

  private async requireAccessibleWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceBuiltInRolesServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceBuiltInRolesServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }
}

function toBuiltInRoleDto(row: WorkspaceRoleRecord, builtinId: WorkspaceBuiltInRoleId): WorkspaceBuiltInRoleDto {
  return {
    id: row.id,
    kind: "builtin",
    builtin_id: builtinId,
    name: row.name,
    description: row.description,
    member_count: row.memberCount,
  };
}

function toCustomRoleRemnantDto(row: WorkspaceRoleRecord): WorkspaceCustomRoleRemnantDto {
  return {
    id: row.id,
    kind: "custom",
    name: row.name,
    description: row.description,
    member_count: row.memberCount,
    created_by: row.createdBy,
  };
}

function isBuiltInRoleId(value: string | null): value is WorkspaceBuiltInRoleId {
  return value === "owner" || value === "admin" || value === "user";
}
