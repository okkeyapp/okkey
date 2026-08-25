import type { IncomingMessage } from "node:http";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import { CapsuleService, CapsuleServiceError } from "../capsule/service.ts";
import {
  CAPSULE_UNSAFE_KEY_TRANSPORT,
  hasUnsafeKeyTransportInUrl,
} from "../capsule/key-transport-policy.ts";

interface CreateCapsuleBody {
  type?: string;
  encryptedPayload?: unknown;
  encryptedMetadata?: unknown;
  ownerKeyWrap?: unknown;
  filePayload?: unknown;
  attachmentFilePayloads?: Record<string, unknown>;
  keyTransportMode?: string;
  expiresAt?: string;
  activateAt?: string;
  deactivateAt?: string;
  deleteAt?: string;
  maxViews?: number;
  viewLimitAction?: "deactivate" | "delete";
  password?: string;
  passwordAttemptLimit?: number;
  allowedRecipientEmails?: string[];
  approvalRequired?: boolean;
  keepExistingPassword?: boolean;
  keepExistingRecipients?: boolean;
  keepExistingFile?: boolean;
}

interface OpenCapsuleBody {
  password?: string;
  keyTransportMode?: string;
  approvalToken?: string;
  guestSessionId?: string;
}

import { isEntityId } from "../entity-id.ts";

export function createCapsuleCreateRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    if (hasUnsafeKeyTransportInUrl(ctx.req.url)) {
      json(
        ctx.res,
        400,
        errorPayload(
          CAPSULE_UNSAFE_KEY_TRANSPORT,
          "unsafe key transport via URL query/path is not allowed",
          ctx.requestId,
        ),
      );
      return;
    }
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
        encryptedMetadata: body.encryptedMetadata,
        ownerKeyWrap: body.ownerKeyWrap,
        filePayload: body.filePayload,
        attachmentFilePayloads: body.attachmentFilePayloads,
        keyTransportMode: body.keyTransportMode,
        expiresAt: body.expiresAt,
        activateAt: body.activateAt,
        deactivateAt: body.deactivateAt,
        deleteAt: body.deleteAt,
        maxViews: body.maxViews,
        viewLimitAction: body.viewLimitAction,
        password: body.password,
        passwordAttemptLimit: body.passwordAttemptLimit,
        allowedRecipientEmails: body.allowedRecipientEmails,
        approvalRequired: body.approvalRequired,
      });
      json(ctx.res, 201, created);
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleOwnerDetailRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId || !isEntityId(capsuleId)) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "capsuleId is required", ctx.requestId));
      return;
    }
    try {
      json(ctx.res, 200, await capsuleService.getOwnerCapsule(capsuleId, userId));
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleUpdateRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId || !isEntityId(capsuleId)) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "capsuleId is required", ctx.requestId));
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
        errorPayload("CAPSULE_BAD_REQUEST", "type and encryptedPayload are required", ctx.requestId),
      );
      return;
    }
    try {
      json(
        ctx.res,
        200,
        await capsuleService.updateCapsule(capsuleId, userId, {
          type: body.type,
          encryptedPayload: body.encryptedPayload,
          encryptedMetadata: body.encryptedMetadata,
          ownerKeyWrap: body.ownerKeyWrap,
          filePayload: body.filePayload,
          attachmentFilePayloads: body.attachmentFilePayloads,
          keyTransportMode: body.keyTransportMode,
          expiresAt: body.expiresAt,
          activateAt: body.activateAt,
          deactivateAt: body.deactivateAt,
          deleteAt: body.deleteAt,
          maxViews: body.maxViews,
          viewLimitAction: body.viewLimitAction,
          password: body.password,
          passwordAttemptLimit: body.passwordAttemptLimit,
          allowedRecipientEmails: body.allowedRecipientEmails,
          approvalRequired: body.approvalRequired,
          keepExistingPassword: body.keepExistingPassword,
          keepExistingRecipients: body.keepExistingRecipients,
          keepExistingFile: body.keepExistingFile,
        }),
      );
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleMetadataRoute(capsuleService: CapsuleService): RouteHandler {
  return async (ctx) => {
    if (hasUnsafeKeyTransportInUrl(ctx.req.url)) {
      json(
        ctx.res,
        400,
        errorPayload(
          CAPSULE_UNSAFE_KEY_TRANSPORT,
          "unsafe key transport via URL query/path is not allowed",
          ctx.requestId,
        ),
      );
      return;
    }
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId || !isEntityId(capsuleId)) {
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

export function createCapsuleOpenRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null> = async () => null,
): RouteHandler {
  return async (ctx) => {
    if (hasUnsafeKeyTransportInUrl(ctx.req.url)) {
      json(
        ctx.res,
        400,
        errorPayload(
          CAPSULE_UNSAFE_KEY_TRANSPORT,
          "unsafe key transport via URL query/path is not allowed",
          ctx.requestId,
        ),
      );
      return;
    }
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId || !isEntityId(capsuleId)) {
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
    try {
      const requesterContext = await resolveRequesterContext(capsuleService, ctx.req);
      const userId = await resolveUserId(ctx.req);
      const capsule = await capsuleService.openCapsule(
        capsuleId,
        requesterContext.ipAddress,
        body.password,
        undefined,
        body.keyTransportMode,
        body.approvalToken,
        userId ?? undefined,
        body.guestSessionId,
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
    if (hasUnsafeKeyTransportInUrl(ctx.req.url)) {
      json(
        ctx.res,
        400,
        errorPayload(
          CAPSULE_UNSAFE_KEY_TRANSPORT,
          "unsafe key transport via URL query/path is not allowed",
          ctx.requestId,
        ),
      );
      return;
    }
    const capsuleId = ctx.params.capsuleId;
    if (!capsuleId || !isEntityId(capsuleId)) {
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

export function createCapsuleOwnerListRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      const requestUrl = new URL(ctx.req.url ?? "/", "http://localhost");
      const page = Number(requestUrl.searchParams.get("page") ?? 1);
      const result = await capsuleService.listOwnerCapsules(
        ctx.params.workspaceId ?? "",
        userId,
        page,
        30,
      );
      json(ctx.res, 200, result);
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleStateRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      const body = await readJsonBody<{ state?: "active" | "inactive" }>(ctx.req);
      if (!body.state) {
        json(ctx.res, 400, errorPayload("CAPSULE_BAD_REQUEST", "state is required", ctx.requestId));
        return;
      }
      json(ctx.res, 200, await capsuleService.setCapsuleState(ctx.params.capsuleId ?? "", userId, body.state));
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleDeleteRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      await capsuleService.deleteCapsule(ctx.params.capsuleId ?? "", userId);
      json(ctx.res, 200, { deleted: true });
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleApprovalRequestRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    try {
      const body = await readJsonBody<{
        guestSessionId?: string;
        deviceLabel?: string;
        platform?: string;
      }>(ctx.req);
      const guestSessionId =
        typeof body.guestSessionId === "string" ? body.guestSessionId.trim() : "";
      if (!userId && !guestSessionId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const requesterContext = await resolveRequesterContext(capsuleService, ctx.req);
      const result = await capsuleService.requestCapsuleApproval({
        capsuleId: ctx.params.capsuleId ?? "",
        ...(userId ? { requesterUserId: userId } : {}),
        ...(guestSessionId && !userId ? { guestSessionId } : {}),
        requestIp: requesterContext.ipAddress,
        deviceLabel: body.deviceLabel ?? requesterContext.deviceLabel,
        platform: body.platform ?? requesterContext.platform,
        country: requesterContext.location.country,
        city: requesterContext.location.city,
      });
      json(ctx.res, 201, result);
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleApprovalEligibilityRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await resolveUserId(ctx.req);
      const requesterContext = await resolveRequesterContext(capsuleService, ctx.req);
      const result = await capsuleService.getApprovalEligibility({
        capsuleId: ctx.params.capsuleId ?? "",
        ...(userId ? { requesterUserId: userId } : {}),
        requestIp: requesterContext.ipAddress,
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleApprovalStatusRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    try {
      const url = new URL(ctx.req.url ?? "/", "http://localhost");
      const guestSessionId = url.searchParams.get("guestSessionId")?.trim() || undefined;
      if (!userId && !guestSessionId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      json(
        ctx.res,
        200,
        await capsuleService.getApprovalStatus(
          ctx.params.requestId ?? "",
          userId ?? undefined,
          guestSessionId,
        ),
      );
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsulePendingApprovalsRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      json(ctx.res, 200, { requests: await capsuleService.listPendingApprovals(userId) });
    } catch (error) {
      handleCapsuleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createCapsuleApprovalResolveRoute(
  capsuleService: CapsuleService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      const body = await readJsonBody<{ decision?: "approve" | "deny" | "blacklist" }>(ctx.req);
      if (
        body.decision !== "approve" &&
        body.decision !== "deny" &&
        body.decision !== "blacklist"
      ) {
        json(ctx.res, 400, errorPayload("CAPSULE_BAD_REQUEST", "decision is required", ctx.requestId));
        return;
      }
      const status = await capsuleService.resolveApproval(ctx.params.requestId ?? "", userId, body.decision);
      json(ctx.res, 200, { requestId: ctx.params.requestId, status });
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
    json(res, error.statusCode, {
      ...errorPayload(error.code, error.message, requestId),
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

async function resolveRequesterContext(capsuleService: CapsuleService, req: IncomingMessage) {
  if (typeof capsuleService.resolveRequesterContext === "function") {
    return capsuleService.resolveRequesterContext({
      remoteAddress: req.socket.remoteAddress,
      forwardedFor: getHeader(req, "x-forwarded-for"),
      userAgent: getHeader(req, "user-agent"),
    });
  }
  return {
    ipAddress: getHeader(req, "x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    deviceLabel: "Unknown device",
    platform: "Unknown",
    location: { country: null, city: null },
  };
}
