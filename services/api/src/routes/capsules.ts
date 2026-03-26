import type { IncomingMessage } from "node:http";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import { CapsuleService, CapsuleServiceError } from "../capsule/service.ts";

interface CreateCapsuleBody {
  type?: string;
  encryptedPayload?: unknown;
  payloadSchemaVersion?: number;
  filePayload?: unknown;
  expiresAt?: string;
  maxViews?: number;
  password?: string;
  allowedRecipientEmails?: string[];
}

interface OpenCapsuleBody {
  password?: string;
  recipientEmail?: string;
}

export function createCapsuleCreateRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }

    let body: CreateCapsuleBody;
    try {
      body = await readJsonBody<CreateCapsuleBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("CAPSULE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.type || !body.encryptedPayload) {
      json(
        ctx.res,
        400,
        errorPayload(
          "CAPSULE_BAD_REQUEST",
          "type and encryptedPayload are required",
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
      const created = await capsuleService.createCapsule(workspaceId, userId, {
        type: body.type,
        encryptedPayload: body.encryptedPayload,
        payloadSchemaVersion: body.payloadSchemaVersion,
        filePayload: body.filePayload,
        expiresAt: body.expiresAt,
        maxViews: body.maxViews,
        password: body.password,
        allowedRecipientEmails: body.allowedRecipientEmails,
      });
      json(ctx.res, 201, created);
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleMetadataRoute(capsuleService: CapsuleService): RouteHandler {
  return async (ctx) => {
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "capsuleId is required", ctx.requestId));
      return;
    }
    try {
      const capsule = await capsuleService.getCapsuleMetadata(capsuleId);
      json(ctx.res, 200, capsule);
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleOpenRoute(capsuleService: CapsuleService): RouteHandler {
  return async (ctx) => {
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "capsuleId is required", ctx.requestId));
      return;
    }
    let body: OpenCapsuleBody;
    try {
      body = await readJsonBody<OpenCapsuleBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("CAPSULE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const requestIp = requestIpFromHeaders(getHeader(ctx.req, "x-forwarded-for"));
    try {
      const capsule = await capsuleService.openCapsule(
        capsuleId,
        requestIp,
        body.password,
        body.recipientEmail,
      );
      json(ctx.res, 200, capsule);
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleRevokeRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "capsuleId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await capsuleService.revokeCapsule(capsuleId, userId);
      json(ctx.res, 200, { revoked: true });
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleCapsuleError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof CapsuleServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
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

function requestIpFromHeaders(forwardedFor: string | undefined): string {
  if (!forwardedFor) {
    return "unknown";
  }
  return forwardedFor.split(",")[0]?.trim() || "unknown";
}
