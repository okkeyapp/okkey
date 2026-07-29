import type { WorkspaceBuiltInProfileId } from "../../../../packages/types/src/workspace-profiles.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceProfilesRepository } from "../storage/workspace-profiles.ts";
import { ensureDefaultWorkspaceProfiles } from "./seed.ts";

export class WorkspaceBuiltInProfilesServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type WorkspaceBuiltInProfileDto = {
  id: string;
  kind: "builtin";
  builtin_id: WorkspaceBuiltInProfileId;
  name: string;
  description: string;
  application_count: number;
};

export interface WorkspaceBuiltInProfilesServiceDeps {
  profiles: WorkspaceProfilesRepository;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  db: QueryExecutorLike;
}

type QueryExecutorLike = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

export class WorkspaceBuiltInProfilesService {
  private readonly profiles: WorkspaceProfilesRepository;
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  private readonly db: QueryExecutorLike;

  constructor(deps: WorkspaceBuiltInProfilesServiceDeps) {
    this.profiles = deps.profiles;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
  }

  async list(workspaceId: string, userId: string): Promise<WorkspaceBuiltInProfileDto[]> {
    await this.requireAccessibleWorkspace(workspaceId, userId);
    await ensureDefaultWorkspaceProfiles(this.db, workspaceId);
    const rows = await this.profiles.listBuiltInByWorkspace(workspaceId);
    return rows.flatMap((row) => {
      if (!isBuiltInProfileId(row.builtinKey)) {
        return [];
      }
      return [
        {
          id: row.id,
          kind: "builtin" as const,
          builtin_id: row.builtinKey,
          name: row.name,
          description: row.description,
          application_count: Number(row.applicationCount) || 0,
        },
      ];
    });
  }

  private async requireAccessibleWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceBuiltInProfilesServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceBuiltInProfilesServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return workspace;
  }
}

function isBuiltInProfileId(value: string | null): value is WorkspaceBuiltInProfileId {
  return value === "extended" || value === "simple";
}
