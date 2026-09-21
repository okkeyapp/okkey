import type { IncomingMessage } from "node:http";
import {
  DeviceService,
  DeviceServiceError,
  type DeviceListItem,
} from "../device/service.ts";
import { resolveClientIpForGeo } from "../capsule/geoip.ts";
import type { ApiConfig } from "../config.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";

interface RegisterDeviceMetadataBody {
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  reclaim_sole_trusted?: boolean;
}

interface RegisterDeviceBody extends RegisterDeviceMetadataBody {
  device_public_key?: string;
  device_share?: string;
  device_fingerprint?: string;
  device_name?: string;
  metadata?: RegisterDeviceMetadataBody;
}

interface RejectDeviceBody {
  reason?: string;
}

interface BlockDeviceBody {
  duration?: string;
  reason?: string;
}

interface UnblockDeviceBody {
  trust?: boolean;
}

interface PatchDeviceBody {
  device_name?: string;
}

interface RevokeDeviceBody {
  reason?: string;
}

async function getRequestIp(
  req: IncomingMessage,
  config: Pick<ApiConfig, "trustedProxyHops">,
): Promise<string> {
  return resolveClientIpForGeo(
    req.socket?.remoteAddress,
    getHeader(req, "x-forwarded-for") ?? undefined,
    config.trustedProxyHops,
  );
}

function resolveMetadata(body: RegisterDeviceBody): RegisterDeviceMetadataBody {
  const metadata = body.metadata ?? {};
  return {
    platform: metadata.platform ?? body.platform ?? "unknown",
    os_name: metadata.os_name ?? body.os_name ?? "unknown",
    os_version: metadata.os_version ?? body.os_version ?? "unknown",
    app_version: metadata.app_version ?? body.app_version ?? "unknown",
    client_type: metadata.client_type ?? body.client_type ?? "unknown",
    user_agent: metadata.user_agent ?? body.user_agent,
  };
}

function getApproverDeviceId(ctx: Parameters<RouteHandler>[0]): string {
  const deviceId = getHeader(ctx.req, "x-device-id");
  if (!deviceId) {
    throw new DeviceServiceError(
      "DEVICE_APPROVAL_ACCESS_DENIED",
      403,
      "trusted approver device required",
    );
  }
  return deviceId;
}

function toWireDevice(item: DeviceListItem) {
  return {
    device_id: item.deviceId,
    device_name: item.deviceName,
    device_fingerprint: item.deviceFingerprint,
    status: item.status,
    platform: item.platform,
    os_name: item.osName,
    os_version: item.osVersion,
    app_version: item.appVersion,
    client_type: item.clientType,
    user_agent: item.userAgent,
    ip_address: item.ipAddress,
    country: item.country,
    city: item.city,
    created_at: item.createdAt,
    last_seen_at: item.lastSeenAt,
    approved_at: item.approvedAt,
    is_current: item.isCurrent,
    approval_expires_at: item.approvalExpiresAt,
    blocked_until: item.blockedUntil ?? null,
  };
}

export function createRegisterDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    let body: RegisterDeviceBody;
    try {
      body = await readJsonBody<RegisterDeviceBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (
      !body.device_public_key ||
      !body.device_share ||
      !body.device_fingerprint ||
      !body.device_name
    ) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "device_public_key, device_share, device_fingerprint and device_name are required",
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
      const metadata = resolveMetadata(body);
      const reclaimSoleTrusted = Boolean(
        body.metadata?.reclaim_sole_trusted ?? body.reclaim_sole_trusted,
      );
      const claimAfterRecovery = Boolean(
        body.metadata?.claim_after_recovery ?? (body as { claim_after_recovery?: boolean }).claim_after_recovery,
      );
      const requestIp = await getRequestIp(ctx.req, { trustedProxyHops });
      const result = await deviceService.registerDevice(userId, requestIp, {
        deviceFingerprint: body.device_fingerprint,
        devicePublicKey: body.device_public_key,
        deviceShare: body.device_share,
        deviceName: body.device_name,
        platform: metadata.platform ?? "unknown",
        osName: metadata.os_name ?? "unknown",
        osVersion: metadata.os_version ?? "unknown",
        appVersion: metadata.app_version ?? "unknown",
        clientType: metadata.client_type ?? "unknown",
        userAgent: metadata.user_agent ?? getHeader(ctx.req, "user-agent") ?? "unknown",
        acceptLanguage: getHeader(ctx.req, "accept-language"),
        reclaimSoleTrusted,
        claimAfterRecovery,
      });

      json(ctx.res, 200, {
        device_id: result.deviceId,
        status: result.status,
        ...(result.status === "blocked"
          ? { blocked_until: result.blockedUntil ?? null }
          : {}),
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createListDevicesRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const url = new URL(ctx.req.url ?? "/", "http://localhost");
      const currentFingerprint =
        getHeader(ctx.req, "x-device-fingerprint") ??
        url.searchParams.get("device_fingerprint") ??
        undefined;
      const result = await deviceService.listDevices(userId, currentFingerprint);
      json(ctx.res, 200, {
        devices: result.devices.map(toWireDevice),
        pending: result.pending.map(toWireDevice),
        blocked: (result.blocked ?? []).map(toWireDevice),
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createPatchDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId),
      );
      return;
    }

    let body: PatchDeviceBody;
    try {
      body = await readJsonBody<PatchDeviceBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (typeof body.device_name !== "string") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "device_name is required", ctx.requestId),
      );
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await deviceService.renameDevice(userId, deviceId, body.device_name);
      json(ctx.res, 200, {
        device_id: result.deviceId,
        device_name: result.deviceName,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createRevokeDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId),
      );
      return;
    }

    let body: RevokeDeviceBody = {};
    try {
      body = await readJsonBody<RevokeDeviceBody>(ctx.req);
    } catch {
      // Empty body is allowed for revoke.
      body = {};
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await deviceService.revokeDevice(userId, deviceId, body.reason);
      json(ctx.res, 200, {
        device_id: result.deviceId,
        status: result.status,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createApproveDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId),
      );
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const approverDeviceId = getApproverDeviceId(ctx);
      const result = await deviceService.approveDevice(userId, approverDeviceId, deviceId);
      json(ctx.res, 200, {
        device_id: result.deviceId,
        status: result.status,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createRejectDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId),
      );
      return;
    }

    let body: RejectDeviceBody;
    try {
      body = await readJsonBody<RejectDeviceBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const approverDeviceId = getApproverDeviceId(ctx);
      const result = await deviceService.rejectDevice(
        userId,
        approverDeviceId,
        deviceId,
        body.reason,
      );
      json(ctx.res, 200, {
        device_id: result.deviceId,
        status: result.status,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

const BLOCK_DURATIONS = new Set(["1h", "1d", "1w", "forever"]);

export function createBlockDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId),
      );
      return;
    }

    let body: BlockDeviceBody;
    try {
      body = await readJsonBody<BlockDeviceBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    const duration = body.duration?.trim();
    if (!duration || !BLOCK_DURATIONS.has(duration)) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "duration must be one of 1h, 1d, 1w, forever",
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
      const approverDeviceId = getApproverDeviceId(ctx);
      const result = await deviceService.blockDevice(
        userId,
        approverDeviceId,
        deviceId,
        duration as "1h" | "1d" | "1w" | "forever",
        body.reason,
      );
      json(ctx.res, 200, {
        device_id: result.deviceId,
        status: result.status,
        blocked_until: result.blockedUntil,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createUnblockDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId),
      );
      return;
    }

    let body: UnblockDeviceBody = {};
    try {
      body = await readJsonBody<UnblockDeviceBody>(ctx.req);
    } catch {
      body = {};
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await deviceService.unblockDevice(
        userId,
        deviceId,
        body.trust === true,
      );
      json(ctx.res, 200, {
        device_id: result.deviceId,
        status: result.status,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleDeviceError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof DeviceServiceError) {
    json(res, error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
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
