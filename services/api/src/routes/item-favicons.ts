import type { IncomingMessage, ServerResponse } from "node:http";

import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { ItemFaviconService, ItemFaviconServiceError } from "../favicon/service.ts";
import { isEntityId } from "../entity-id.ts";

function sendBinary(
  res: ServerResponse,
  statusCode: number,
  body: Uint8Array,
  headers: Record<string, string>,
): void {
  if (res.writableEnded) {
    return;
  }

  res.statusCode = statusCode;
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.end(Buffer.from(body));
}

export function createItemFaviconGetRoute(service: ItemFaviconService): RouteHandler {
  return async (ctx) => {
    const faviconId = ctx.params.faviconId?.trim();
    if (!faviconId || !isEntityId(faviconId)) {
      json(ctx.res, 400, {
        error: "BAD_REQUEST",
        message: "faviconId must be a snowflake entity id",
        requestId: ctx.requestId,
      });
      return;
    }

    const bytes = await service.getBytes(faviconId);
    if (!bytes) {
      json(ctx.res, 404, { error: "NOT_FOUND", message: "Favicon not found", requestId: ctx.requestId });
      return;
    }

    sendBinary(ctx.res, 200, bytes, {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  };
}

type PreviewBody = {
  urls?: string[];
};

export function createItemFaviconPreviewRoute(
  service: ItemFaviconService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, { error: "UNAUTHORIZED", message: "Authentication required", requestId: ctx.requestId });
      return;
    }

    let body: PreviewBody;
    try {
      body = (await readJsonBody(ctx.req)) as PreviewBody;
    } catch {
      json(ctx.res, 400, { error: "BAD_REQUEST", message: "Invalid JSON body", requestId: ctx.requestId });
      return;
    }

    const urls = Array.isArray(body.urls) ? body.urls.filter((url): url is string => typeof url === "string") : [];

    try {
      const bytes = await service.previewFromUrls(urls);
      if (!bytes) {
        json(ctx.res, 404, { error: "NOT_FOUND", message: "Favicon not found", requestId: ctx.requestId });
        return;
      }

      sendBinary(ctx.res, 200, bytes, {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
      });
    } catch (error) {
      if (error instanceof ItemFaviconServiceError) {
        json(ctx.res, error.statusCode, {
          error: error.code,
          message: error.message,
          requestId: ctx.requestId,
        });
        return;
      }
      json(ctx.res, 500, {
        error: "FAVICON_PREVIEW_FAILED",
        message: error instanceof Error ? error.message : "Favicon preview failed",
        requestId: ctx.requestId,
      });
    }
  };
}

type UpsertBody = {
  urls?: string[];
  clear?: boolean;
  pngBase64?: string;
};

function decodePngBase64(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const bytes = Buffer.from(trimmed, "base64");
    return bytes.byteLength > 0 ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

export function createItemFaviconUpsertRoute(
  service: ItemFaviconService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, { error: "UNAUTHORIZED", message: "Authentication required", requestId: ctx.requestId });
      return;
    }

    const vaultId = ctx.params.vaultId?.trim();
    const itemId = ctx.params.itemId?.trim();
    if (!vaultId || !isEntityId(vaultId) || !itemId || !isEntityId(itemId)) {
      json(ctx.res, 400, {
        error: "BAD_REQUEST",
        message: "vaultId and itemId must be snowflake entity ids",
        requestId: ctx.requestId,
      });
      return;
    }

    let body: UpsertBody;
    try {
      body = (await readJsonBody(ctx.req)) as UpsertBody;
    } catch {
      json(ctx.res, 400, { error: "BAD_REQUEST", message: "Invalid JSON body", requestId: ctx.requestId });
      return;
    }

    try {
      if (body.clear === true) {
        await service.clear(vaultId, itemId, userId);
        json(ctx.res, 200, { faviconId: null });
        return;
      }

      const pngBase64 = typeof body.pngBase64 === "string" ? body.pngBase64 : undefined;
      if (pngBase64 !== undefined) {
        const pngBytes = decodePngBase64(pngBase64);
        if (!pngBytes) {
          json(ctx.res, 400, {
            error: "BAD_REQUEST",
            message: "pngBase64 must be a non-empty base64-encoded PNG",
            requestId: ctx.requestId,
          });
          return;
        }

        const result = await service.upsertFromPngBytes(vaultId, itemId, userId, pngBytes);
        json(ctx.res, 200, result);
        return;
      }

      const urls = Array.isArray(body.urls)
        ? body.urls.filter((url): url is string => typeof url === "string")
        : [];

      const result = await service.upsertFromUrls(vaultId, itemId, userId, urls);
      json(ctx.res, 200, result);
    } catch (error) {
      if (error instanceof ItemFaviconServiceError) {
        json(ctx.res, error.statusCode, {
          error: error.code,
          message: error.message,
          requestId: ctx.requestId,
        });
        return;
      }
      json(ctx.res, 500, {
        error: "FAVICON_UPSERT_FAILED",
        message: error instanceof Error ? error.message : "Favicon upsert failed",
        requestId: ctx.requestId,
      });
    }
  };
}

export function createItemFaviconDeleteRoute(
  service: ItemFaviconService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, { error: "UNAUTHORIZED", message: "Authentication required", requestId: ctx.requestId });
      return;
    }

    const vaultId = ctx.params.vaultId?.trim();
    const itemId = ctx.params.itemId?.trim();
    if (!vaultId || !isEntityId(vaultId) || !itemId || !isEntityId(itemId)) {
      json(ctx.res, 400, {
        error: "BAD_REQUEST",
        message: "vaultId and itemId must be snowflake entity ids",
        requestId: ctx.requestId,
      });
      return;
    }

    try {
      await service.clear(vaultId, itemId, userId);
      ctx.res.statusCode = 204;
      ctx.res.end();
    } catch (error) {
      if (error instanceof ItemFaviconServiceError) {
        json(ctx.res, error.statusCode, {
          error: error.code,
          message: error.message,
          requestId: ctx.requestId,
        });
        return;
      }
      json(ctx.res, 500, {
        error: "FAVICON_DELETE_FAILED",
        message: error instanceof Error ? error.message : "Favicon delete failed",
        requestId: ctx.requestId,
      });
    }
  };
}
