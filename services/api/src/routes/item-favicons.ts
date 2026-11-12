import type { IncomingMessage, ServerResponse } from "node:http";

import { detectFaviconImageMediaType, type FaviconImageMediaType } from "../favicon/fetch-remote.ts";
import { ItemFaviconService, ItemFaviconServiceError } from "../favicon/service.ts";
import { json, readJsonBody, type RouteHandler } from "../http.ts";

/** Document policy sent with SVG preview bodies. */
export const FAVICON_SVG_PREVIEW_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";

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

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  if (!res.writableEnded) {
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
  json(res, statusCode, payload);
}

function previewImageHeaders(bytes: Uint8Array, mediaType: FaviconImageMediaType): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": mediaType,
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (mediaType === "image/svg+xml") {
    // fetch() callers still read the raw bytes (they sanitize and rasterize SVG).
    // These headers apply when the response is opened as a document.
    headers["Content-Security-Policy"] = FAVICON_SVG_PREVIEW_CONTENT_SECURITY_POLICY;
    headers["Content-Disposition"] = "attachment";
  }
  return headers;
}

type PreviewBody = {
  urls?: string[];
};

/** Public mode advertisement. Does not accept website URLs. */
export function createItemFaviconConfigRoute(service: ItemFaviconService): RouteHandler {
  return async (ctx) => {
    json(ctx.res, 200, { provider: service.provider });
  };
}

export function createItemFaviconPreviewRoute(
  service: ItemFaviconService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    if (!service.serverFetchesWebsiteIcons()) {
      // Refuse before reading the body so item domains are not parsed on the private default.
      sendJson(ctx.res, 403, {
        error: "FAVICON_DISABLED",
        message: "Website icon lookup is disabled",
        requestId: ctx.requestId,
      });
      return;
    }

    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      sendJson(ctx.res, 401, { error: "UNAUTHORIZED", message: "Authentication required", requestId: ctx.requestId });
      return;
    }

    let body: PreviewBody;
    try {
      body = (await readJsonBody(ctx.req)) as PreviewBody;
    } catch {
      sendJson(ctx.res, 400, { error: "BAD_REQUEST", message: "Invalid JSON body", requestId: ctx.requestId });
      return;
    }

    const urls = Array.isArray(body.urls) ? body.urls.filter((url): url is string => typeof url === "string") : [];

    try {
      const lookup = await service.previewFromUrls(urls);
      if (lookup.status === "unavailable") {
        // Site could not be reached (DNS / refused / timeout / 5xx). Not a positive absence —
        // clients must keep any previously stored favicon.
        sendJson(ctx.res, 503, {
          error: "FAVICON_UNAVAILABLE",
          message: "Website unreachable; favicon temporarily unavailable",
          requestId: ctx.requestId,
        });
        return;
      }
      if (lookup.status === "absent") {
        sendJson(ctx.res, 404, { error: "NOT_FOUND", message: "Favicon not found", requestId: ctx.requestId });
        return;
      }

      const mediaType = detectFaviconImageMediaType(lookup.bytes);
      if (!mediaType) {
        sendJson(ctx.res, 415, {
          error: "UNSUPPORTED_MEDIA_TYPE",
          message: "Favicon payload is not a supported image",
          requestId: ctx.requestId,
        });
        return;
      }

      sendBinary(ctx.res, 200, lookup.bytes, previewImageHeaders(lookup.bytes, mediaType));
    } catch (error) {
      if (error instanceof ItemFaviconServiceError) {
        sendJson(ctx.res, error.statusCode, {
          error: error.code,
          message: error.message,
          requestId: ctx.requestId,
        });
        return;
      }
      sendJson(ctx.res, 500, {
        error: "FAVICON_PREVIEW_FAILED",
        message: error instanceof Error ? error.message : "Favicon preview failed",
        requestId: ctx.requestId,
      });
    }
  };
}
