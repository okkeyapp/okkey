import type { IncomingMessage } from "node:http";
import { json, type RouteHandler } from "../http.ts";
import {
  WorkspaceBuiltInProfilesService,
  WorkspaceBuiltInProfilesServiceError,
} from "../workspace-profiles/list-service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

export function createWorkspaceBuiltInProfilesListRoute(
  service: WorkspaceBuiltInProfilesService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    const workspaceId = ctx.params.workspaceId?.trim() ?? "";
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("INVALID_WORKSPACE_ID", "workspace id is required", ctx.requestId));
      return;
    }

    try {
      const profiles = await service.list(workspaceId, userId);
      json(ctx.res, 200, { profiles });
    } catch (error) {
      if (error instanceof WorkspaceBuiltInProfilesServiceError) {
        json(ctx.res, error.statusCode, errorPayload(error.code, error.message, ctx.requestId));
        return;
      }
      json(ctx.res, 500, errorPayload("INTERNAL_ERROR", "internal error", ctx.requestId));
    }
  };
}
