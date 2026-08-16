import type { IncomingMessage } from "node:http";

import {
  ensureProfilePermissions,
  getBuiltInProfilePermissions,
  type MeVaultProfilesResponseDto,
} from "../../../../packages/types/src/workspace-profiles.ts";
import { json, type RouteHandler } from "../http.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { WorkspaceProfilesRepository } from "../storage/workspace-profiles.ts";
import { ensureDefaultWorkspaceProfiles } from "../workspace-profiles/seed.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

type QueryExecutorLike = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

export class WorkspaceMeVaultProfilesServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class WorkspaceMeVaultProfilesService {
  private readonly profiles: WorkspaceProfilesRepository;
  private readonly workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  private readonly db: QueryExecutorLike;

  constructor(
    profiles: WorkspaceProfilesRepository,
    workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">,
    db: QueryExecutorLike,
  ) {
    this.profiles = profiles;
    this.workspaces = workspaces;
    this.db = db;
  }

  async list(workspaceId: string, userId: string): Promise<MeVaultProfilesResponseDto> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspaceMeVaultProfilesServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspaceMeVaultProfilesServiceError("ACCESS_DENIED", 403, "access denied");
    }

    await ensureDefaultWorkspaceProfiles(this.db, workspaceId);
    const extended = await this.profiles.findByBuiltinKey(workspaceId, "extended");
    const rows = await this.profiles.listMeVaultProfiles(workspaceId, userId);

    const vaults = rows.flatMap((row) => {
      if (row.profileId && row.permissionsJson) {
        return [
          {
            vaultId: row.vaultId,
            profileId: row.profileId,
            permissions: ensureProfilePermissions(row.permissionsJson),
          },
        ];
      }
      if (row.isPersonal) {
        if (!extended) {
          return [
            {
              vaultId: row.vaultId,
              profileId: "builtin:extended",
              permissions: getBuiltInProfilePermissions("extended"),
            },
          ];
        }
        return [
          {
            vaultId: row.vaultId,
            profileId: extended.id,
            permissions: ensureProfilePermissions(extended.permissionsJson),
          },
        ];
      }
      return [];
    });

    return { workspaceId, vaults };
  }
}

export function createWorkspaceMeVaultProfilesRoute(
  service: WorkspaceMeVaultProfilesService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await service.list(workspaceId, userId);
      json(ctx.res, 200, body);
    } catch (error) {
      if (error instanceof WorkspaceMeVaultProfilesServiceError) {
        json(ctx.res, error.statusCode, errorPayload(error.code, error.message, ctx.requestId));
        return;
      }
      console.error("[workspace-me-vault-profiles] unexpected error", ctx.requestId, error);
      json(ctx.res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", ctx.requestId));
    }
  };
}
