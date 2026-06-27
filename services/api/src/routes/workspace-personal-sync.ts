import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  WorkspacePersonalSyncService,
  WorkspacePersonalSyncServiceError,
} from "../workspace-personal-sync/service.ts";

interface AppendEventBody {
  eventType?: string;
  encryptedBlob?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export function createWorkspacePersonalEventsListRoute(
  syncService: WorkspacePersonalSyncService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const url = new URL(ctx.req.url ?? "", "http://localhost");
      const afterVersionRaw = url.searchParams.get("afterVersion") ?? "0";
      const afterVersion = Number(afterVersionRaw);
      const events = await syncService.listEvents(workspaceId, userId, afterVersion);
      json(ctx.res, 200, {
        workspaceId,
        userId,
        afterVersion,
        events,
      });
    } catch (error) {
      handleSyncError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspacePersonalEventsAppendRoute(
  syncService: WorkspacePersonalSyncService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }

    let body: AppendEventBody;
    try {
      body = await readJsonBody<AppendEventBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!body.eventType || !body.encryptedBlob || body.baseVersion === undefined) {
      json(
        ctx.res,
        400,
        errorPayload(
          "SYNC_BAD_REQUEST",
          "eventType, encryptedBlob and baseVersion are required",
          ctx.requestId,
        ),
      );
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const created = await syncService.appendEvent(workspaceId, userId, {
        eventType: body.eventType,
        encryptedBlob: body.encryptedBlob,
        baseVersion: body.baseVersion,
        idempotencyKey: body.idempotencyKey,
        clientCreatedAt: body.clientCreatedAt,
      });
      json(ctx.res, 201, created);
    } catch (error) {
      handleSyncError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleSyncError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof WorkspacePersonalSyncServiceError) {
    json(res, error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

function errorPayload(code: string, message: string, requestId: string) {
  return {
    error: code,
    message,
    requestId,
  };
}
