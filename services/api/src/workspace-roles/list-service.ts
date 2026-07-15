import type { WorkspaceBuiltInRoleId } from "../../../../packages/types/src/workspace-roles.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceRolesRepository } from "../storage/workspace-roles.ts";
import { ensureDefaultWorkspaceRoles } from "./seed.ts";

export class WorkspaceBuiltInRolesServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type WorkspaceBuiltInRoleDto = {
  id: string;
  kind: "builtin";
  builtin_id: WorkspaceBuiltInRoleId;
  name: string;
  description: string;
  member_count: number;
};

export interface WorkspaceBuiltInRolesServiceDeps {
  roles: WorkspaceRolesRepository;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  db: QueryExecutorLike;
}

type QueryExecutorLike = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

export class WorkspaceBuiltInRolesService {
  private readonly roles: WorkspaceRolesRepository;
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  private readonly db: QueryExecutorLike;

  constructor(deps: WorkspaceBuiltInRolesServiceDeps) {
    this.roles = deps.roles;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
  }

  async list(workspaceId: string, userId: string): Promise<WorkspaceBuiltInRoleDto[]> {
    const workspace = await this.requireAccessibleWorkspace(workspaceId, userId);
    await ensureDefaultWorkspaceRoles(this.db, workspaceId, workspace.ownerId);
    const rows = await this.roles.listBuiltInByWorkspace(workspaceId);
    return rows.flatMap((row) => {
      if (!isBuiltInRoleId(row.builtinKey)) {
        return [];
      }
      return [
        {
          id: row.id,
          kind: "builtin" as const,
          builtin_id: row.builtinKey,
          name: row.name,
          description: row.description,
          member_count: row.memberCount,
        },
      ];
    });
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

function isBuiltInRoleId(value: string | null): value is WorkspaceBuiltInRoleId {
  return value === "owner" || value === "admin" || value === "user";
}
