import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { SyncService, SyncServiceError } from "../sync/service.ts";

interface AppendEventBody {
  eventType?: string;
  encryptedBlob?: unknown;
  encryptedPayload?: string;
  baseVersion?: number;
  payloadSchemaVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export function createSyncEventsListRoute(
  syncService: SyncService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "vaultId is required", ctx.requestId));
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
      const events = await syncService.listEvents(vaultId, userId, afterVersion);
      json(ctx.res, 200, {
        vaultId,
        afterVersion,
        events,
      });
    } catch (error) {
      handleSyncError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createSyncEventsAppendRoute(
  syncService: SyncService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    let body: AppendEventBody;
    try {
      body = await readJsonBody<AppendEventBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!body.eventType || (!body.encryptedBlob && !body.encryptedPayload) || body.baseVersion === undefined) {
      json(
        ctx.res,
        400,
        errorPayload(
          "SYNC_BAD_REQUEST",
          "eventType, encryptedBlob|encryptedPayload and baseVersion are required",
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
      const created = await syncService.appendEvent(vaultId, userId, {
        eventType: body.eventType,
        encryptedBlob: body.encryptedBlob,
        encryptedPayload: body.encryptedPayload,
        baseVersion: body.baseVersion,
        payloadSchemaVersion: body.payloadSchemaVersion,
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
  if (error instanceof SyncServiceError) {
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
