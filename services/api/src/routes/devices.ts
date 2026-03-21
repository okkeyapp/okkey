import { DeviceService, DeviceServiceError } from "../device/service.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";

interface RegisterDeviceMetadataBody {
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
}

interface RegisterDeviceBody extends RegisterDeviceMetadataBody {
  device_public_key?: string;
  device_share?: string;
  device_fingerprint?: string;
  device_name?: string;
  metadata?: RegisterDeviceMetadataBody;
}

function requestIpFromHeaders(forwardedFor: string | undefined): string {
  if (!forwardedFor) {
    return "unknown";
  }
  const first = forwardedFor.split(",")[0]?.trim();
  return first || "unknown";
}

function getRequestIp(req: Parameters<typeof getHeader>[0]): string {
  return requestIpFromHeaders(getHeader(req, "x-forwarded-for"));
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

function getUserId(ctx: Parameters<RouteHandler>[0]): string {
  const userId = getHeader(ctx.req, "x-user-id");
  if (!userId) {
    throw new DeviceServiceError("AUTH_REQUIRED", 401, "auth required");
  }
  return userId;
}

export function createRegisterDeviceRoute(deviceService: DeviceService): RouteHandler {
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
      const userId = getUserId(ctx);
      const metadata = resolveMetadata(body);
      const result = await deviceService.registerDevice(userId, getRequestIp(ctx.req), {
        deviceFingerprint: body.device_fingerprint,
        devicePublicKey: body.device_public_key,
        deviceShare: body.device_share,
        deviceName: body.device_name,
        platform: metadata.platform,
        osName: metadata.os_name,
        osVersion: metadata.os_version,
        appVersion: metadata.app_version,
        clientType: metadata.client_type,
        userAgent: metadata.user_agent ?? getHeader(ctx.req, "user-agent") ?? "unknown",
      });

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
