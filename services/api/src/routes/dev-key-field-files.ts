import type { IncomingMessage, ServerResponse } from "node:http";

import { getHeader, json, type RouteHandler } from "../http.ts";
import type { ApiConfig } from "../config.ts";
import { KeyFieldFileStorage } from "../storage/key-field-file-storage.ts";

async function readRawBody(req: IncomingMessage): Promise<Uint8Array> {
  const mockedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (mockedBody !== undefined) {
    if (typeof mockedBody === "string") {
      return Uint8Array.from(Buffer.from(mockedBody));
    }
    if (mockedBody instanceof Uint8Array) {
      return mockedBody;
    }
    if (Buffer.isBuffer(mockedBody)) {
      return Uint8Array.from(mockedBody);
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return Uint8Array.from(Buffer.concat(chunks));
}

function resolvePublicBaseUrl(req: IncomingMessage, config: ApiConfig): string {
  const forwardedHost = getHeader(req, "x-forwarded-host");
  const host = forwardedHost ?? getHeader(req, "host") ?? `localhost:${config.port}`;
  const proto = getHeader(req, "x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function decodeFileName(raw: string | undefined): string {
  if (!raw) {
    return "file";
  }

  try {
    return decodeURIComponent(raw).trim() || "file";
  } catch {
    return raw.trim() || "file";
  }
}

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

export function createDevKeyFieldFileUploadRoute(
  storage: KeyFieldFileStorage,
  config: ApiConfig,
): RouteHandler {
  return async (ctx) => {
    if (config.nodeEnv === "production") {
      json(ctx.res, 404, { error: "NOT_FOUND", message: "Route not found", requestId: ctx.requestId });
      return;
    }

    const fileName = decodeFileName(getHeader(ctx.req, "x-file-name"));
    const mimeType = getHeader(ctx.req, "content-type") ?? "application/octet-stream";
    const body = await readRawBody(ctx.req);

    if (body.byteLength === 0) {
      json(ctx.res, 400, {
        error: "BAD_REQUEST",
        message: "File body is required",
        requestId: ctx.requestId,
      });
      return;
    }

    try {
      const stored = await storage.upload(fileName, mimeType, body);
      const baseUrl = resolvePublicBaseUrl(ctx.req, config);
      json(ctx.res, 201, {
        attachmentId: stored.attachmentId,
        name: stored.name,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        url: `${baseUrl}/dev/key-field-files/${encodeURIComponent(stored.attachmentId)}`,
      });
    } catch (error) {
      json(ctx.res, 500, {
        error: "UPLOAD_FAILED",
        message: error instanceof Error ? error.message : "Upload failed",
        requestId: ctx.requestId,
      });
    }
  };
}

export function createDevKeyFieldFileGetRoute(storage: KeyFieldFileStorage, config: ApiConfig): RouteHandler {
  return async (ctx) => {
    if (config.nodeEnv === "production") {
      json(ctx.res, 404, { error: "NOT_FOUND", message: "Route not found", requestId: ctx.requestId });
      return;
    }

    const attachmentId = ctx.params.attachmentId;
    if (!attachmentId) {
      json(ctx.res, 400, { error: "BAD_REQUEST", message: "attachmentId is required", requestId: ctx.requestId });
      return;
    }

    const stored = await storage.get(attachmentId);
    if (!stored) {
      json(ctx.res, 404, { error: "NOT_FOUND", message: "File not found", requestId: ctx.requestId });
      return;
    }

    const isImage = stored.mimeType.startsWith("image/");
    const encodedName = encodeURIComponent(stored.name);
    sendBinary(ctx.res, 200, stored.body, {
      "Content-Type": stored.mimeType,
      "Content-Length": String(stored.body.byteLength),
      "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=3600",
    });
  };
}

export function createDevKeyFieldFileDeleteRoute(storage: KeyFieldFileStorage, config: ApiConfig): RouteHandler {
  return async (ctx) => {
    if (config.nodeEnv === "production") {
      json(ctx.res, 404, { error: "NOT_FOUND", message: "Route not found", requestId: ctx.requestId });
      return;
    }

    const attachmentId = ctx.params.attachmentId;
    if (!attachmentId) {
      json(ctx.res, 400, { error: "BAD_REQUEST", message: "attachmentId is required", requestId: ctx.requestId });
      return;
    }

    try {
      await storage.delete(attachmentId);
      ctx.res.statusCode = 204;
      ctx.res.end();
    } catch (error) {
      json(ctx.res, 500, {
        error: "DELETE_FAILED",
        message: error instanceof Error ? error.message : "Delete failed",
        requestId: ctx.requestId,
      });
    }
  };
}
