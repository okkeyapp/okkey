import type { IncomingMessage, ServerResponse } from "node:http";

import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { ItemFaviconService, ItemFaviconServiceError } from "../favicon/service.ts";

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
