import type { IncomingMessage, ServerResponse } from "node:http";

import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  sanitizeTileColor,
  WorkspaceSettingsServiceError,
} from "../workspace-settings/service.ts";
import { WorkspaceKeyRotationError } from "../workspace-key/removal.ts";
import {
  parseWorkspaceKeyWrap,
  WorkspaceKeyService,
  WorkspaceKeyServiceError,
} from "../workspace-key/service.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

function errorPayload(code: string, message: string, requestId: string, details?: Record<string, unknown>) {
  return {
    error: code,
    message,
    requestId,
    ...(details ? { details } : {}),
  };
}

function handleError(requestId: string, res: ServerResponse, error: unknown): void {
  if (
    error instanceof WorkspaceKeyServiceError ||
    error instanceof WorkspaceKeyRotationError ||
    error instanceof WorkspaceSettingsServiceError
  ) {
    const details = error instanceof WorkspaceKeyServiceError ? error.details : undefined;
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId, details));
    return;
  }
  console.error("[workspace-key] unexpected error", requestId, error);
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

async function requireUser(
  ctx: Parameters<RouteHandler>[0],
  resolveUserId: ResolveUserId,
): Promise<string | null> {
  const userId = await resolveUserId(ctx.req);
  if (!userId) {
    json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
    return null;
  }
  return userId;
}

async function readRawBody(req: IncomingMessage): Promise<Uint8Array> {
  const mockedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (mockedBody !== undefined) {
    if (mockedBody instanceof Uint8Array) {
      return mockedBody;
    }
    if (Buffer.isBuffer(mockedBody)) {
      return Uint8Array.from(mockedBody);
    }
    if (typeof mockedBody === "string") {
      return Uint8Array.from(Buffer.from(mockedBody));
    }
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Uint8Array.from(Buffer.concat(chunks));
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

export function createWorkspaceKeyGetRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const state = await service.getForMember(workspaceId, userId);
      json(ctx.res, 200, {
        current_version: state.currentVersion,
        wraps: state.wraps.map((wrap) => ({
          key_version: wrap.keyVersion,
          encrypted_workspace_key: wrap.encryptedWorkspaceKey,
        })),
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceKeyPublishRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const body = await readJsonBody<{ wraps?: unknown }>(ctx.req);
      if (!Array.isArray(body.wraps) || body.wraps.length === 0) {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "wraps are required", ctx.requestId));
        return;
      }
      const wraps = body.wraps.map((wrap) => parseWorkspaceKeyWrap(wrap));
      const result = await service.publishVersion1(workspaceId, userId, wraps);
      json(ctx.res, 200, { current_version: result.currentVersion });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceKeyGrantRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const body = await readJsonBody<unknown>(ctx.req);
      const wrap = parseWorkspaceKeyWrap(body);
      const result = await service.grantCurrentWrap(workspaceId, userId, wrap);
      json(ctx.res, 200, { key_version: result.keyVersion });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceLogoPutRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const ciphertext = await readRawBody(ctx.req);
      const result = await service.putLogo(workspaceId, userId, ciphertext);
      json(ctx.res, 200, {
        key_version: result.keyVersion,
        ciphertext_bytes: result.ciphertextBytes,
        etag: result.etag,
        logo_updated_at: result.updatedAt,
        logo_vault_id: null,
        logo_attachment_id: null,
        quota: result.quota,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceLogoGetRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const logo = await service.getLogo(workspaceId, userId);
      const etag = `"${logo.etag}"`;
      const ifNoneMatch = getHeader(ctx.req, "if-none-match");
      if (ifNoneMatch === etag) {
        ctx.res.statusCode = 304;
        ctx.res.setHeader("ETag", etag);
        ctx.res.setHeader("X-Workspace-Key-Version", String(logo.keyVersion));
        ctx.res.end();
        return;
      }
      sendBinary(ctx.res, 200, logo.ciphertext, {
        "Content-Type": "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
        ETag: etag,
        "X-Workspace-Key-Version": String(logo.keyVersion),
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceLogoDeleteRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const quota = await service.deleteLogo(workspaceId, userId);
      json(ctx.res, 200, { deleted: true, quota });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceClientSettingsGetRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const settings = await service.getClientSettings(workspaceId, userId);
      json(ctx.res, 200, {
        key_version: settings?.keyVersion ?? null,
        ciphertext: settings ? Buffer.from(settings.ciphertext).toString("base64") : null,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceClientSettingsPutRoute(
  service: WorkspaceKeyService,
  resolveUserId: ResolveUserId,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await requireUser(ctx, resolveUserId);
      if (!userId) {
        return;
      }
      const body = await readJsonBody<{ ciphertext?: unknown; tile_color?: unknown }>(ctx.req);
      if (typeof body.ciphertext !== "string" || body.ciphertext.length === 0) {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "ciphertext is required", ctx.requestId));
        return;
      }
      const ciphertext = Uint8Array.from(Buffer.from(body.ciphertext, "base64"));
      if (ciphertext.length === 0 || Buffer.from(ciphertext).toString("base64") !== body.ciphertext) {
        json(ctx.res, 400, errorPayload("BAD_REQUEST", "ciphertext must be base64", ctx.requestId));
        return;
      }
      let tileColor: string | null | undefined;
      if (body.tile_color === null) {
        tileColor = null;
      } else if (typeof body.tile_color === "string") {
        tileColor = sanitizeTileColor(body.tile_color);
      }
      const result = await service.putClientSettings(workspaceId, userId, { ciphertext, tileColor });
      json(ctx.res, 200, {
        key_version: result.keyVersion,
        ciphertext: body.ciphertext,
        tile_color: tileColor,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}
