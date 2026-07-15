import type { IncomingMessage } from "node:http";
import { json, type RouteHandler } from "../http.ts";
import {
  WorkspaceBuiltInRolesService,
  WorkspaceBuiltInRolesServiceError,
} from "../workspace-roles/list-service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

export function createWorkspaceBuiltInRolesListRoute(
  service: WorkspaceBuiltInRolesService,
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
      const roles = await service.list(workspaceId, userId);
      json(ctx.res, 200, { roles });
    } catch (error) {
      if (error instanceof WorkspaceBuiltInRolesServiceError) {
        json(ctx.res, error.statusCode, errorPayload(error.code, error.message, ctx.requestId));
        return;
      }
      json(ctx.res, 500, errorPayload("INTERNAL_ERROR", "internal error", ctx.requestId));
    }
  };
}
