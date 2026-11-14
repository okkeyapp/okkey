import type { IncomingMessage } from "node:http";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { requestClientIp } from "../request-ip.ts";
import type { ResolvedAccessToken } from "../session/service.ts";
import {
  PasskeyDeviceApprovalError,
  type PasskeyDeviceApprovalService,
} from "../webauthn/passkey-device-approval.ts";

const FORBIDDEN_WRAP_FIELDS = ["prf_output", "prfOutput", "device_share", "deviceShare"] as const;

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

function handleError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof PasskeyDeviceApprovalError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

function canonicalDeviceId(value: string): string | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function sameDeviceId(left: string, right: string): boolean {
  const a = canonicalDeviceId(left);
  const b = canonicalDeviceId(right);
  return a !== null && a === b;
}

/** Reject bodies that try to hand the server a PRF output or a plaintext share. */
export function shareWrapBodyRejection(body: Record<string, unknown>): string | null {
  for (const field of FORBIDDEN_WRAP_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      return "PASSKEY_SHARE_WRAP_REJECTED";
    }
  }
  return null;
}

export function createPasskeyShareWrapOptionsRoute(
  service: PasskeyDeviceApprovalService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const credentialRowId = ctx.params.credentialId?.trim() ?? "";
    if (!credentialRowId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "credentialId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await service.shareWrapOptions({
        userId,
        credentialRowId,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, {
        challengeId: result.challengeId,
        options: result.options,
        prf_salt: result.prfSaltB64,
        credential_id: result.credentialId,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyShareWrapVerifyRoute(
  service: PasskeyDeviceApprovalService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const credentialRowId = ctx.params.credentialId?.trim() ?? "";
    if (!credentialRowId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "credentialId is required", ctx.requestId));
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody<Record<string, unknown>>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (shareWrapBodyRejection(body)) {
      json(
        ctx.res,
        400,
        errorPayload(
          "PASSKEY_SHARE_WRAP_REJECTED",
          "share wrap body must not include a PRF output or device share",
          ctx.requestId,
        ),
      );
      return;
    }
    const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
    const shareWrap = typeof body.share_wrap === "string" ? body.share_wrap.trim() : "";
    if (!challengeId || !shareWrap || !body.response || typeof body.response !== "object") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "challengeId, response and share_wrap are required", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await service.shareWrapVerify({
        userId,
        credentialRowId,
        challengeId,
        response: body.response as AuthenticationResponseJSON,
        shareWrapB64: shareWrap,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, { credential_id: credentialRowId, has_share_wrap: true });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyShareWrapDeleteRoute(
  service: PasskeyDeviceApprovalService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const credentialRowId = ctx.params.credentialId?.trim() ?? "";
    if (!credentialRowId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "credentialId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await service.clearShareWrap({
        userId,
        credentialRowId,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, { credential_id: credentialRowId, has_share_wrap: false });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyApprovalOptionsRoute(
  service: PasskeyDeviceApprovalService,
  resolveSession: (req: IncomingMessage) => Promise<ResolvedAccessToken | null>,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId ?? "");
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is invalid", ctx.requestId));
      return;
    }
    try {
      const session = await resolveSession(ctx.req);
      if (!session?.userId || !session.deviceId || !sameDeviceId(session.deviceId, deviceId)) {
        json(
          ctx.res,
          session?.userId ? 403 : 401,
          errorPayload(
            session?.userId ? "PASSKEY_APPROVAL_FORBIDDEN" : "AUTH_REQUIRED",
            session?.userId ? "only the pending device can approve itself with a passkey" : "auth required",
            ctx.requestId,
          ),
        );
        return;
      }
      const result = await service.approvalOptions({
        userId: session.userId,
        deviceId,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, {
        challengeId: result.challengeId,
        options: result.options,
        prf_salt: result.prfSaltB64,
        credentials: result.credentials.map((credential) => ({
          credential_id: credential.credentialId,
          share_wrap: credential.shareWrapB64,
          share_wrap_salt: credential.shareWrapSaltB64,
          share_wrap_version: credential.shareWrapVersion,
        })),
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyApprovalVerifyRoute(
  service: PasskeyDeviceApprovalService,
  resolveSession: (req: IncomingMessage) => Promise<ResolvedAccessToken | null>,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId ?? "");
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is invalid", ctx.requestId));
      return;
    }
    let body: {
      challengeId?: string;
      response?: AuthenticationResponseJSON;
      device_share?: string;
    };
    try {
      body = await readJsonBody(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.challengeId?.trim() || !body.response || !body.device_share?.trim()) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "challengeId, response and device_share are required",
          ctx.requestId,
        ),
      );
      return;
    }
    try {
      const session = await resolveSession(ctx.req);
      if (!session?.userId || !session.deviceId || !sameDeviceId(session.deviceId, deviceId)) {
        json(
          ctx.res,
          session?.userId ? 403 : 401,
          errorPayload(
            session?.userId ? "PASSKEY_APPROVAL_FORBIDDEN" : "AUTH_REQUIRED",
            session?.userId ? "only the pending device can approve itself with a passkey" : "auth required",
            ctx.requestId,
          ),
        );
        return;
      }
      const result = await service.approvalVerify({
        userId: session.userId,
        deviceId,
        challengeId: body.challengeId.trim(),
        response: body.response,
        deviceShareB64: body.device_share.trim(),
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, { device_id: result.deviceId, status: result.status });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

function parseHandoffId(raw: string | undefined): string | null {
  const id = raw?.trim() ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
}

function requirePendingDeviceSession(
  session: ResolvedAccessToken | null,
  deviceId: string,
  requestId: string,
  res: Parameters<typeof json>[0],
): session is ResolvedAccessToken & { userId: string; deviceId: string } {
  if (!session?.userId || !session.deviceId || !sameDeviceId(session.deviceId, deviceId)) {
    json(
      res,
      session?.userId ? 403 : 401,
      errorPayload(
        session?.userId ? "PASSKEY_APPROVAL_FORBIDDEN" : "AUTH_REQUIRED",
        session?.userId ? "only the pending device can approve itself with a passkey" : "auth required",
        requestId,
      ),
    );
    return false;
  }
  return true;
}

export function createPasskeyHandoffCreateRoute(
  service: PasskeyDeviceApprovalService,
  resolveSession: (req: IncomingMessage) => Promise<ResolvedAccessToken | null>,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId ?? "");
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is invalid", ctx.requestId));
      return;
    }
    try {
      const session = await resolveSession(ctx.req);
      if (!requirePendingDeviceSession(session, deviceId, ctx.requestId, ctx.res)) {
        return;
      }
      const created = await service.createHandoff({
        userId: session.userId,
        deviceId,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, {
        request_id: created.requestId,
        status: created.status,
        expires_at: created.expiresAt,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyHandoffStatusRoute(
  service: PasskeyDeviceApprovalService,
  resolveSession: (req: IncomingMessage) => Promise<ResolvedAccessToken | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId ?? "");
    const handoffId = parseHandoffId(ctx.params.handoffId);
    if (!deviceId || !handoffId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "handoff is invalid", ctx.requestId));
      return;
    }
    try {
      const session = await resolveSession(ctx.req);
      if (!requirePendingDeviceSession(session, deviceId, ctx.requestId, ctx.res)) {
        return;
      }
      const status = await service.readHandoff({
        userId: session.userId,
        deviceId,
        requestId: handoffId,
      });
      json(ctx.res, 200, {
        request_id: handoffId,
        status: status.status,
        expires_at: status.expiresAt,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyHandoffPublicOptionsRoute(
  service: PasskeyDeviceApprovalService,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const handoffId = parseHandoffId(ctx.params.handoffId);
    if (!handoffId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "handoff is invalid", ctx.requestId));
      return;
    }
    try {
      const result = await service.handoffOptions({
        requestId: handoffId,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, {
        challengeId: result.challengeId,
        options: result.options,
        prf_salt: result.prfSaltB64,
        credentials: result.credentials.map((credential) => ({
          credential_id: credential.credentialId,
          share_wrap: credential.shareWrapB64,
          share_wrap_salt: credential.shareWrapSaltB64,
          share_wrap_version: credential.shareWrapVersion,
        })),
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyHandoffPublicVerifyRoute(
  service: PasskeyDeviceApprovalService,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const handoffId = parseHandoffId(ctx.params.handoffId);
    if (!handoffId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "handoff is invalid", ctx.requestId));
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody<Record<string, unknown>>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, "prf_output") ||
      Object.prototype.hasOwnProperty.call(body, "prfOutput")
    ) {
      json(
        ctx.res,
        400,
        errorPayload("PASSKEY_SHARE_WRAP_REJECTED", "passkey handoff must not include a PRF output", ctx.requestId),
      );
      return;
    }
    const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
    const deviceShare = typeof body.device_share === "string" ? body.device_share.trim() : "";
    if (!challengeId || !deviceShare || !body.response || typeof body.response !== "object") {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "challengeId, response and device_share are required",
          ctx.requestId,
        ),
      );
      return;
    }
    try {
      const result = await service.handoffVerify({
        requestId: handoffId,
        challengeId,
        response: body.response as AuthenticationResponseJSON,
        deviceShareB64: deviceShare,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, { device_id: result.deviceId, status: result.status });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPasskeyHandoffPublicRejectRoute(
  service: PasskeyDeviceApprovalService,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const handoffId = parseHandoffId(ctx.params.handoffId);
    if (!handoffId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "handoff is invalid", ctx.requestId));
      return;
    }
    try {
      const rejected = await service.handoffReject({
        requestId: handoffId,
        requestIp: requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      });
      json(ctx.res, 200, {
        request_id: handoffId,
        status: rejected.status,
        expires_at: rejected.expiresAt,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}
