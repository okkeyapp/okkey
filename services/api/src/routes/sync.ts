import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  SYNC_EVENTS_BATCH_MAX,
  SyncService,
  SyncServiceError,
} from "../sync/service.ts";

interface AppendEventBody {
  eventType?: string;
  encryptedBlob?: unknown;
  signature?: unknown;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  referencedItemId?: string;
  itemSoftDeleted?: boolean;
  itemDeletedAtMs?: number;
}

interface AppendEventsBatchBody {
  events?: AppendEventBody[];
}

const EVENT_TYPES_REQUIRING_SIGNATURE = new Set(["VAULT_SHARE", "VAULT_KEY_ROTATION"]);

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
      const latestVersion =
        events.length > 0 ? (events[events.length - 1]?.version ?? afterVersion) : afterVersion;
      json(ctx.res, 200, {
        vaultId,
        afterVersion,
        events,
        // Full tail in one response today — clients stop without an empty follow-up GET.
        latestVersion,
        hasMore: false,
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
    if (EVENT_TYPES_REQUIRING_SIGNATURE.has(body.eventType) && !body.signature) {
      json(
        ctx.res,
        400,
        errorPayload(
          "SIGNATURE_REQUIRED",
          "signature is required for this eventType",
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
        signature: body.signature,
        baseVersion: body.baseVersion,
        idempotencyKey: body.idempotencyKey,
        clientCreatedAt: body.clientCreatedAt,
        referencedItemId: body.referencedItemId,
        itemSoftDeleted: body.itemSoftDeleted,
        itemDeletedAtMs: body.itemDeletedAtMs,
      });
      json(ctx.res, 201, created);
    } catch (error) {
      handleSyncError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createSyncEventsAppendBatchRoute(
  syncService: SyncService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    let body: AppendEventsBatchBody;
    try {
      body = await readJsonBody<AppendEventsBatchBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("SYNC_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!Array.isArray(body.events) || body.events.length === 0) {
      json(
        ctx.res,
        400,
        errorPayload("SYNC_BAD_REQUEST", "events must be a non-empty array", ctx.requestId),
      );
      return;
    }
    if (body.events.length > SYNC_EVENTS_BATCH_MAX) {
      json(
        ctx.res,
        400,
        errorPayload(
          "SYNC_BAD_REQUEST",
          `events batch exceeds max of ${SYNC_EVENTS_BATCH_MAX}`,
          ctx.requestId,
        ),
      );
      return;
    }

    for (const event of body.events) {
      if (!event.eventType || !event.encryptedBlob || event.baseVersion === undefined) {
        json(
          ctx.res,
          400,
          errorPayload(
            "SYNC_BAD_REQUEST",
            "eventType, encryptedBlob and baseVersion are required for each event",
            ctx.requestId,
          ),
        );
        return;
      }
      if (EVENT_TYPES_REQUIRING_SIGNATURE.has(event.eventType) && !event.signature) {
        json(
          ctx.res,
          400,
          errorPayload(
            "SIGNATURE_REQUIRED",
            "signature is required for this eventType",
            ctx.requestId,
          ),
        );
        return;
      }
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const created = await syncService.appendEvents(
        vaultId,
        userId,
        body.events.map((event) => ({
          eventType: event.eventType!,
          encryptedBlob: event.encryptedBlob,
          signature: event.signature,
          baseVersion: event.baseVersion!,
          idempotencyKey: event.idempotencyKey,
          clientCreatedAt: event.clientCreatedAt,
          referencedItemId: event.referencedItemId,
          itemSoftDeleted: event.itemSoftDeleted,
          itemDeletedAtMs: event.itemDeletedAtMs,
        })),
      );
      const latestVersion =
        created.length > 0 ? (created[created.length - 1]?.version ?? 0) : 0;
      json(ctx.res, 201, {
        vaultId,
        events: created,
        latestVersion,
      });
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
