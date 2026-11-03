import type {
  WorkspaceBuiltInProfileDto,
  WorkspaceBuiltInProfileId,
  WorkspaceCustomProfileRemnantDto,
  WorkspaceProfileListItemDto,
} from "../../../../packages/types/src/workspace-profiles.ts";
import { isEntityId } from "../entity-id.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceProfileRecord, WorkspaceProfilesRepository } from "../storage/workspace-profiles.ts";
import {
  assertWorkspacePermissionOnObject,
  permissionAllowsObject,
  resolveWorkspacePermissions,
  WorkspacePermissionError,
} from "../workspace-roles/permissions.ts";
import { ensureDefaultWorkspaceProfiles } from "./seed.ts";

export type { WorkspaceBuiltInProfileDto, WorkspaceCustomProfileRemnantDto, WorkspaceProfileListItemDto };

export class WorkspaceBuiltInProfilesServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type WorkspaceProfilesRepositoryLike = Pick<
  WorkspaceProfilesRepository,
  "listByWorkspace" | "findById" | "deleteCustom"
>;

export interface WorkspaceBuiltInProfilesServiceDeps {
  profiles: WorkspaceProfilesRepositoryLike;
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  db: QueryExecutorLike;
}

type QueryExecutorLike = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

/**
 * Open-core profiles: built-in profiles plus custom-profile remnants left after enterprise modules were disabled.
 * Custom profiles cannot be created or edited here; they can only be listed and deleted.
 */
export class WorkspaceBuiltInProfilesService {
  private readonly profiles: WorkspaceProfilesRepositoryLike;
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  private readonly db: QueryExecutorLike;

  constructor(deps: WorkspaceBuiltInProfilesServiceDeps) {
    this.profiles = deps.profiles;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
  }

  async list(workspaceId: string, userId: string): Promise<WorkspaceProfileListItemDto[]> {
    await this.requireAccessibleWorkspace(workspaceId, userId);
    await ensureDefaultWorkspaceProfiles(this.db, workspaceId);
    const rows = await this.profiles.listByWorkspace(workspaceId);
    const customGetLevel = rows.some((row) => !row.isSystem)
      ? await this.resolveProfilesGetLevel(workspaceId, userId)
      : 0;
    return rows.flatMap((row): WorkspaceProfileListItemDto[] => {
      if (row.isSystem) {
        return isBuiltInProfileId(row.builtinKey) ? [toBuiltInProfileDto(row, row.builtinKey)] : [];
      }
      const isOwn = row.createdBy === userId;
      return permissionAllowsObject(customGetLevel, isOwn) ? [toCustomProfileRemnantDto(row)] : [];
    });
  }

  /** Not plan-gated: after downgrade, existing custom profiles must remain removable. */
  async deleteCustomProfile(workspaceId: string, userId: string, profileId: string): Promise<void> {
    await this.requireAccessibleWorkspace(workspaceId, userId);

    const normalizedProfileId = profileId.trim();
    if (!isEntityId(normalizedProfileId)) {
      throw new WorkspaceBuiltInProfilesServiceError("INVALID_PROFILE_ID", 400, "profile id is required");
    }

    const existing = await this.profiles.findById(workspaceId, normalizedProfileId);
    if (!existing) {
      throw new WorkspaceBuiltInProfilesServiceError("PROFILE_NOT_FOUND", 404, "profile not found");
    }
    if (existing.isSystem) {
      throw new WorkspaceBuiltInProfilesServiceError(
        "PROFILE_NOT_MUTABLE",
        403,
        "system profiles cannot be deleted",
      );
    }

    const isOwn = existing.createdBy === userId;
    await this.assertProfilesDeleteOnObject(workspaceId, userId, isOwn);

    const deleted = await this.profiles.deleteCustom(workspaceId, normalizedProfileId);
    if (!deleted) {
      throw new WorkspaceBuiltInProfilesServiceError("PROFILE_NOT_FOUND", 404, "profile not found");
    }
  }

  private async resolveProfilesGetLevel(workspaceId: string, userId: string): Promise<0 | 1 | 2> {
    try {
      const matrix = await resolveWorkspacePermissions(this.db, workspaceId, userId);
      return matrix.profiles.get;
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        return 0;
      }
      throw error;
    }
  }

  private async assertProfilesDeleteOnObject(workspaceId: string, userId: string, isOwn: boolean) {
    try {
      await assertWorkspacePermissionOnObject(this.db, workspaceId, userId, "profiles", "delete", isOwn);
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        throw new WorkspaceBuiltInProfilesServiceError(error.code, error.statusCode, error.message);
      }
      throw error;
    }
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

function toBuiltInProfileDto(
  row: WorkspaceProfileRecord,
  builtinId: WorkspaceBuiltInProfileId,
): WorkspaceBuiltInProfileDto {
  return {
    id: row.id,
    kind: "builtin",
    builtin_id: builtinId,
    name: row.name,
    description: row.description,
    application_count: Number(row.applicationCount) || 0,
  };
}

function toCustomProfileRemnantDto(row: WorkspaceProfileRecord): WorkspaceCustomProfileRemnantDto {
  return {
    id: row.id,
    kind: "custom",
    name: row.name,
    description: row.description,
    application_count: Number(row.applicationCount) || 0,
    created_by: row.createdBy,
  };
}

function isBuiltInProfileId(value: string | null): value is WorkspaceBuiltInProfileId {
  return value === "extended" || value === "simple";
}
