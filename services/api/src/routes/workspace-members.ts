import type { IncomingMessage } from "node:http";

import { json, type RouteHandler } from "../http.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../workspace-members/service.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

function handleMembersError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof WorkspaceMembersServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  console.error("[workspace-members] unexpected error", requestId, error);
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

export function createWorkspaceMembersListRoute(
  membersService: WorkspaceMembersService,
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
      const result = await membersService.listMembers(workspaceId, userId);
      json(ctx.res, 200, {
        workspaceId,
        members: result.members,
        actorPermissions: result.actorPermissions,
      });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceMemberDirectoryRoute(
  membersService: WorkspaceMembersService,
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
      const members = await membersService.listMemberDirectory(workspaceId, userId);
      json(ctx.res, 200, { workspaceId, members });
    } catch (error) {
      handleMembersError(ctx.requestId, ctx.res, error);
    }
  };
}
