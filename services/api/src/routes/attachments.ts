import type { IncomingMessage, ServerResponse } from "node:http";

import { getHeader, json, type RouteHandler } from "../http.ts";
import { isEntityId } from "../entity-id.ts";
import { AttachmentService, AttachmentServiceError } from "../attachments/service.ts";

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

function decodeBase64Header(raw: string | undefined): Uint8Array | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const bytes = Buffer.from(raw.trim(), "base64");
    return bytes.byteLength > 0 ? Uint8Array.from(bytes) : null;
  } catch {
    return null;
  }
}

function parseSizeHeader(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function validateAttachmentParams(ctx: Parameters<RouteHandler>[0]): { vaultId: string; itemId: string; attachmentId?: string } | null {
  const vaultId = ctx.params.vaultId?.trim();
  const itemId = ctx.params.itemId?.trim();
  const attachmentId = ctx.params.attachmentId?.trim();
  const attachmentValid = attachmentId === undefined || (attachmentId.length > 0 && isEntityId(attachmentId));
  if (!vaultId || !isEntityId(vaultId) || !itemId || !isEntityId(itemId) || !attachmentValid) {
    json(ctx.res, 400, {
      error: "BAD_REQUEST",
      message: "vaultId, itemId and attachmentId must be snowflake entity ids",
      requestId: ctx.requestId,
    });
    return null;
  }
  return { vaultId, itemId, attachmentId };
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

function sendServiceError(ctx: Parameters<RouteHandler>[0], error: unknown, fallbackCode: string, fallbackMessage: string): void {
  if (error instanceof AttachmentServiceError) {
    json(ctx.res, error.statusCode, {
      error: error.code,
      message: error.message,
      requestId: ctx.requestId,
    });
    return;
  }

  json(ctx.res, 500, {
    error: fallbackCode,
    message: error instanceof Error ? error.message : fallbackMessage,
    requestId: ctx.requestId,
  });
}

export function createAttachmentUploadRoute(
  service: AttachmentService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, { error: "AUTH_REQUIRED", message: "Authentication required", requestId: ctx.requestId });
      return;
    }

    const params = validateAttachmentParams(ctx);
    if (!params) {
      return;
    }

    const encryptedKey = decodeBase64Header(getHeader(ctx.req, "x-encrypted-key"));
    if (!encryptedKey) {
      json(ctx.res, 400, {
        error: "INVALID_ATTACHMENT_METADATA",
        message: "X-Encrypted-Key header is required",
        requestId: ctx.requestId,
      });
      return;
    }

    const encryptedBody = await readRawBody(ctx.req);
    const fileName = decodeFileName(getHeader(ctx.req, "x-file-name"));
    const mimeType = getHeader(ctx.req, "x-file-mime-type") ?? "application/octet-stream";
    const sizeBytes = parseSizeHeader(getHeader(ctx.req, "x-file-size"), encryptedBody.byteLength);

    try {
      const result = await service.upload({
        vaultId: params.vaultId,
        itemId: params.itemId,
        userId,
        fileName,
        mimeType,
        encryptedBody,
        encryptedKey,
        sizeBytes,
      });
      json(ctx.res, 201, result);
    } catch (error) {
      sendServiceError(ctx, error, "ATTACHMENT_UPLOAD_FAILED", "Attachment upload failed");
    }
  };
}

export function createAttachmentDownloadRoute(
  service: AttachmentService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, { error: "AUTH_REQUIRED", message: "Authentication required", requestId: ctx.requestId });
      return;
    }

    const params = validateAttachmentParams(ctx);
    if (!params?.attachmentId) {
      return;
    }

    try {
      const result = await service.download(params.vaultId, params.itemId, params.attachmentId, userId);
      const encodedName = encodeURIComponent(result.name);
      sendBinary(ctx.res, 200, result.encryptedBody, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(result.encryptedBody.byteLength),
        "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Encrypted-Key": Buffer.from(result.record.encryptedKey).toString("base64"),
        "X-File-Name": encodedName,
        "X-File-Mime-Type": result.mimeType,
        "X-File-Size": String(result.record.size),
        "Access-Control-Expose-Headers": "X-Encrypted-Key, X-File-Name, X-File-Mime-Type, X-File-Size",
      });
    } catch (error) {
      sendServiceError(ctx, error, "ATTACHMENT_DOWNLOAD_FAILED", "Attachment download failed");
    }
  };
}

export function createAttachmentDeleteRoute(
  service: AttachmentService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, { error: "AUTH_REQUIRED", message: "Authentication required", requestId: ctx.requestId });
      return;
    }

    const params = validateAttachmentParams(ctx);
    if (!params?.attachmentId) {
      return;
    }

    try {
      await service.delete(params.vaultId, params.itemId, params.attachmentId, userId);
      ctx.res.statusCode = 204;
      ctx.res.end();
    } catch (error) {
      sendServiceError(ctx, error, "ATTACHMENT_DELETE_FAILED", "Attachment delete failed");
    }
  };
}
