import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  CapsuleDefaultsService,
  CapsuleDefaultsServiceError,
  parseCapsuleAccessDefaultsPayload,
  parseCapsuleDefaultsType,
} from "../capsule-defaults/service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type UpsertBody = {
  type?: unknown;
  settings?: unknown;
};

export function createWorkspaceCapsuleDefaultsRoute(
  service: CapsuleDefaultsService,
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
      json(
        ctx.res,
        400,
        errorPayload("INVALID_WORKSPACE_ID", "workspace id is required", ctx.requestId),
      );
      return;
    }

    try {
      if (ctx.req.method === "GET") {
        const defaults = await service.listDefaults(workspaceId, userId);
        json(ctx.res, 200, { defaults });
        return;
      }

      const body = await readJsonBody<UpsertBody>(ctx.req);
      const type = parseCapsuleDefaultsType(body.type);
      if (!type) {
        json(
          ctx.res,
          400,
          errorPayload("INVALID_CAPSULE_TYPE", "type must be text, file, or item", ctx.requestId),
        );
        return;
      }
      const settings = parseCapsuleAccessDefaultsPayload(body.settings);
      if (!settings) {
        json(
          ctx.res,
          400,
          errorPayload("INVALID_SETTINGS", "settings must be an object", ctx.requestId),
        );
        return;
      }

      const updated = await service.upsertDefaults(workspaceId, userId, type, settings);
      json(ctx.res, 200, updated);
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof CapsuleDefaultsServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}
