import type { IncomingMessage } from "node:http";

import {
  DEVICE_APPROVAL_STATUS_HEADER,
  DeviceApprovalStatusError,
  DeviceApprovalStatusService,
} from "../device/approval-status.ts";
import {
  enforceApprovalStatusRateLimit,
  type ApprovalStatusRateLimit,
} from "../device/approval-status-rate-limit.ts";
import { getHeader, json, type RouteHandler } from "../http.ts";
import { requestClientIp } from "../request-ip.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

function presentedToken(req: IncomingMessage): string {
  return getHeader(req, DEVICE_APPROVAL_STATUS_HEADER)?.trim() ?? "";
}

function canonicalDeviceId(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n || parsed > 9223372036854775807n) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function sendStatusError(
  res: Parameters<typeof json>[0],
  requestId: string,
  error: unknown,
): void {
  if (error instanceof DeviceApprovalStatusError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

export function createDeviceApprovalStatusRoute(
  service: DeviceApprovalStatusService,
  rateLimit: ApprovalStatusRateLimit,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId);
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId));
      return;
    }
    const limited = await enforceApprovalStatusRateLimit(ctx.req, rateLimit, deviceId, "poll");
    if (limited.status === "limited") {
      ctx.res.setHeader("Retry-After", String(limited.retryAfterSeconds));
      json(ctx.res, 429, errorPayload("AUTH_RATE_LIMITED", "rate limited", ctx.requestId));
      return;
    }
    try {
      const snapshot = await service.read(presentedToken(ctx.req), deviceId);
      json(ctx.res, 200, {
        device_id: snapshot.deviceId,
        status: snapshot.status,
        blocked_until: snapshot.blockedUntil,
        expires_at: snapshot.expiresAt,
      });
    } catch (error: unknown) {
      sendStatusError(ctx.res, ctx.requestId, error);
    }
  };
}

export function createDeviceApprovalRetryRoute(
  service: DeviceApprovalStatusService,
  rateLimit: ApprovalStatusRateLimit,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId);
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId));
      return;
    }
    const limited = await enforceApprovalStatusRateLimit(ctx.req, rateLimit, deviceId, "retry");
    if (limited.status === "limited") {
      ctx.res.setHeader("Retry-After", String(limited.retryAfterSeconds));
      json(ctx.res, 429, errorPayload("AUTH_RATE_LIMITED", "rate limited", ctx.requestId));
      return;
    }
    try {
      const issued = await service.retry(
        presentedToken(ctx.req),
        deviceId,
        requestClientIp(ctx.req, trustedProxyHops) || "unknown",
      );
      json(ctx.res, 200, {
        device_id: issued.deviceId,
        status: "pending_approval",
        approval_status_token: issued.token,
        approval_status_expires_at: issued.expiresAt,
      });
    } catch (error: unknown) {
      sendStatusError(ctx.res, ctx.requestId, error);
    }
  };
}
