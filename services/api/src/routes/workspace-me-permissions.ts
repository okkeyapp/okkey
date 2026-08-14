import type { IncomingMessage } from "node:http";

import { json, type RouteHandler } from "../http.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import {
  resolveWorkspacePermissions,
  WorkspacePermissionError,
} from "../workspace-roles/permissions.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

export function createWorkspaceMePermissionsRoute(
  db: QueryExecutor,
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
      const permissions = await resolveWorkspacePermissions(db, workspaceId, userId);
      json(ctx.res, 200, { workspaceId, permissions });
    } catch (error) {
      if (error instanceof WorkspacePermissionError) {
        json(ctx.res, error.statusCode, errorPayload(error.code, error.message, ctx.requestId));
        return;
      }
      console.error("[workspace-me-permissions] unexpected error", ctx.requestId, error);
      json(ctx.res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", ctx.requestId));
    }
  };
}
