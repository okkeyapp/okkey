import type { IncomingMessage } from "node:http";
import {
  DeviceService,
  DeviceServiceError,
  type DeviceListItem,
} from "../device/service.ts";
import { resolveClientIpForGeo } from "../capsule/geoip.ts";
import type { ApiConfig } from "../config.ts";
import { isEntityId } from "../entity-id.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import type { SessionService } from "../session/service.ts";
import { isFullSessionScope } from "../session/scopes.ts";

/** PostgreSQL `bigint` max (signed). Reject larger snowflake strings before querying. */
const MAX_PG_BIGINT = 9223372036854775807n;

type SessionDeviceBinding = Pick<
  SessionService,
  | "bindAccessTokenDevice"
  | "resolveAccessToken"
  | "revokeSessionsForDevice"
  | "revokeAccessToken"
  | "hashAccessToken"
>;

function getBearerToken(req: IncomingMessage): string | null {
  const auth = getHeader(req, "authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = auth.slice(7).trim();
  return token || null;
}

function isValidDeviceIdParam(value: string): boolean {
  if (!isEntityId(value)) {
    return false;
  }
  try {
    return BigInt(value) > 0n && BigInt(value) <= MAX_PG_BIGINT;
  } catch {
    return false;
  }
}

/** Decimal form without leading zeros. Snowflake ids compare equal as integers. */
function canonicalDeviceId(value: string): string | null {
  if (!isValidDeviceIdParam(value)) {
    return null;
  }
  return BigInt(value).toString();
}

function sameDeviceId(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) {
    return false;
  }
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

interface RegisterDeviceMetadataBody {
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  reclaim_sole_trusted?: boolean;
  claim_after_recovery?: boolean;
  /** Pending sibling for recovery proof. Does not replace a trusted device. */
  recovery_pending?: boolean;
}

interface RegisterDeviceBody extends RegisterDeviceMetadataBody {
  device_public_key?: string;
  device_share?: string;
  device_fingerprint?: string;
  device_name?: string;
  one_time_x25519_public_key?: string;
  one_time_mlkem_public_key?: string;
  challenge_id?: string;
  signature?: string;
  share_proof?: string;
  /** UI locale for approval email templates (`en` | `ru`). */
  locale?: string;
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
  /** Explicit sign-out path may revoke the caller device (e.g. extension logout). */
  sign_out?: boolean;
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

type RegisterBooleanField =
  | "reclaim_sole_trusted"
  | "claim_after_recovery"
  | "recovery_pending";

interface RegisterBooleanFlags {
  reclaimSoleTrusted: boolean;
  claimAfterRecovery: boolean;
  recoveryPending: boolean;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Device-register flags accept only JSON booleans.
 * An omitted flag is false. When `metadata` is an object and contains the key,
 * that value is used (including `null`, which is rejected). Otherwise the same
 * top-level field is used. `claim_after_recovery` still suppresses `recovery_pending`.
 */
function readRegisterBooleanFlags(
  body: RegisterDeviceBody,
): { ok: true; flags: RegisterBooleanFlags } | { ok: false; field: RegisterBooleanField } {
  const record = body as unknown as Record<string, unknown>;

  const read = (field: RegisterBooleanField): { ok: true; value: boolean } | { ok: false } => {
    const metadata = record.metadata;
    const source =
      isJsonObject(metadata) && Object.prototype.hasOwnProperty.call(metadata, field)
        ? metadata
        : record;
    if (!Object.prototype.hasOwnProperty.call(source, field)) {
      return { ok: true, value: false };
    }
    const value = source[field];
    if (typeof value === "boolean") {
      return { ok: true, value };
    }
    return { ok: false };
  };

  const reclaimSoleTrusted = read("reclaim_sole_trusted");
  if (!reclaimSoleTrusted.ok) {
    return { ok: false, field: "reclaim_sole_trusted" };
  }
  const claimAfterRecovery = read("claim_after_recovery");
  if (!claimAfterRecovery.ok) {
    return { ok: false, field: "claim_after_recovery" };
  }
  const recoveryPending = read("recovery_pending");
  if (!recoveryPending.ok) {
    return { ok: false, field: "recovery_pending" };
  }

  return {
    ok: true,
    flags: {
      reclaimSoleTrusted: reclaimSoleTrusted.value,
      claimAfterRecovery: claimAfterRecovery.value,
      recoveryPending: !claimAfterRecovery.value && recoveryPending.value,
    },
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
    ...(item.oneTimeX25519PublicKey && item.oneTimeMlkemPublicKey
      ? {
          one_time_x25519_public_key: item.oneTimeX25519PublicKey,
          one_time_mlkem_public_key: item.oneTimeMlkemPublicKey,
        }
      : {}),
  };
}

export function createRegisterDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  trustedProxyHops = 0,
  sessionService?: Pick<SessionDeviceBinding, "bindAccessTokenDevice"> &
    Partial<Pick<SessionDeviceBinding, "hashAccessToken">>,
  mayClaimAfterRecovery?: (req: IncomingMessage) => Promise<boolean>,
  resolveProvedRecoveryDevice?: (
    req: IncomingMessage,
  ) => Promise<{ userId: string; deviceId: string } | null>,
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

    const parsedFlags = readRegisterBooleanFlags(body);
    if (!parsedFlags.ok) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          `${parsedFlags.field} must be a boolean`,
          ctx.requestId,
        ),
      );
      return;
    }
    const { reclaimSoleTrusted, claimAfterRecovery, recoveryPending } = parsedFlags.flags;

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const metadata = resolveMetadata(body);
      if (claimAfterRecovery && mayClaimAfterRecovery) {
        const allowed = await mayClaimAfterRecovery(ctx.req);
        if (!allowed) {
          json(
            ctx.res,
            403,
            errorPayload(
              "RECOVERY_PROOF_REQUIRED",
              "recovery key proof is required before claiming this device",
              ctx.requestId,
            ),
          );
          return;
        }
      }
      let provedDeviceId: string | undefined;
      if (claimAfterRecovery) {
        const proved = resolveProvedRecoveryDevice
          ? await resolveProvedRecoveryDevice(ctx.req)
          : null;
        if (!proved || proved.userId !== userId || proved.deviceId.trim() === "") {
          json(
            ctx.res,
            403,
            errorPayload(
              "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE",
              "recovery claim requires the pending device that proved the recovery key",
              ctx.requestId,
            ),
          );
          return;
        }
        provedDeviceId = proved.deviceId.trim();
      }
      const requestIp = await getRequestIp(ctx.req, { trustedProxyHops });
      const accessToken = getBearerToken(ctx.req);
      // Kept across a pending-row replacement so this session can bind to the new row.
      const preserveSessionTokenHash =
        accessToken && typeof sessionService?.hashAccessToken === "function"
          ? sessionService.hashAccessToken(accessToken)
          : undefined;
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
        locale: typeof body.locale === "string" ? body.locale : undefined,
        acceptLanguage: getHeader(ctx.req, "accept-language"),
        reclaimSoleTrusted,
        claimAfterRecovery,
        provedDeviceId,
        recoveryPending,
        preserveSessionTokenHash,
        oneTimeX25519PublicKey:
          typeof body.one_time_x25519_public_key === "string"
            ? body.one_time_x25519_public_key
            : undefined,
        oneTimeMlkemPublicKey:
          typeof body.one_time_mlkem_public_key === "string"
            ? body.one_time_mlkem_public_key
            : undefined,
      });
      const bindCreated =
        result.created &&
        (result.status === "trusted" || result.status === "pending_approval");
      // Rebind only the new pending row. Never attach this session to the existing trusted device.
      const bindRecoveryPending = recoveryPending && result.status === "pending_approval";
      if (accessToken && sessionService && (bindCreated || bindRecoveryPending)) {
        await sessionService.bindAccessTokenDevice(accessToken, userId, result.deviceId, {
          replaceExistingDevice: claimAfterRecovery,
        });
      }

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

interface BindDeviceSessionBody {
  challenge_id?: string;
  signature?: string;
  share_proof?: string;
  new_device_public_key?: string;
  device_name?: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
}

export function createDeviceBindChallengeRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  sessionService?: Pick<SessionDeviceBinding, "hashAccessToken">,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId ?? "");
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is invalid", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      const accessToken = getBearerToken(ctx.req);
      if (!userId || !accessToken || !sessionService) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const issued = await deviceService.issueDeviceBindChallenge({
        userId,
        deviceId,
        tokenHash: sessionService.hashAccessToken(accessToken),
      });
      json(ctx.res, 200, {
        challenge_id: issued.challengeId,
        challenge: issued.challengeB64,
        expires_at: issued.expiresAt,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createRequestDeviceKeyRebindRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  trustedProxyHops = 0,
  sessionService?: Pick<SessionDeviceBinding, "hashAccessToken">,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId ?? "");
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is invalid", ctx.requestId),
      );
      return;
    }
    let body: RegisterDeviceBody;
    try {
      body = await readJsonBody<RegisterDeviceBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const headerFingerprint = getHeader(ctx.req, "x-device-fingerprint")?.trim() ?? "";
    const bodyFingerprint =
      typeof body.device_fingerprint === "string" ? body.device_fingerprint.trim() : "";
    if (
      typeof body.device_public_key !== "string" ||
      typeof body.device_share !== "string" ||
      typeof body.challenge_id !== "string" ||
      !body.device_public_key.trim() ||
      !body.device_share.trim() ||
      !body.challenge_id.trim()
    ) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "device_public_key, device_share and challenge_id are required",
          ctx.requestId,
        ),
      );
      return;
    }
    if (body.signature != null && typeof body.signature !== "string") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "signature must be a string", ctx.requestId),
      );
      return;
    }
    if (body.share_proof != null && typeof body.share_proof !== "string") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "share_proof must be a string", ctx.requestId),
      );
      return;
    }
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    const shareProof = typeof body.share_proof === "string" ? body.share_proof.trim() : "";
    if (!signature && !shareProof) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "device key rebind requires a signature or share_proof",
          ctx.requestId,
        ),
      );
      return;
    }
    if (!headerFingerprint && !bodyFingerprint) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "device_fingerprint is required", ctx.requestId),
      );
      return;
    }
    if (
      headerFingerprint &&
      bodyFingerprint &&
      headerFingerprint.toLowerCase() !== bodyFingerprint.toLowerCase()
    ) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "device_fingerprint does not match this session",
          ctx.requestId,
        ),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      const accessToken = getBearerToken(ctx.req);
      if (!userId || !accessToken || !sessionService) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const metadata = resolveMetadata(body);
      const requestIp = await getRequestIp(ctx.req, { trustedProxyHops });
      const result = await deviceService.requestDeviceKeyRebind(userId, requestIp, {
        deviceId,
        deviceFingerprint: headerFingerprint || bodyFingerprint,
        tokenHash: sessionService.hashAccessToken(accessToken),
        challengeId: body.challenge_id.trim(),
        signatureB64: signature,
        shareProofB64: shareProof,
        devicePublicKey: body.device_public_key.trim(),
        deviceShare: body.device_share.trim(),
        deviceName: body.device_name?.trim() || "Unknown device",
        platform: metadata.platform ?? "unknown",
        osName: metadata.os_name ?? "unknown",
        osVersion: metadata.os_version ?? "unknown",
        appVersion: metadata.app_version ?? "unknown",
        clientType: metadata.client_type ?? "unknown",
        userAgent:
          metadata.user_agent?.trim() || getHeader(ctx.req, "user-agent") || "unknown",
        locale: typeof body.locale === "string" ? body.locale : undefined,
        acceptLanguage: getHeader(ctx.req, "accept-language") ?? undefined,
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

export function createBindDeviceSessionRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  sessionService?: Pick<SessionDeviceBinding, "bindAccessTokenDevice" | "hashAccessToken">,
): RouteHandler {
  return async (ctx) => {
    const deviceId = canonicalDeviceId(ctx.params.deviceId ?? "");
    if (!deviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is invalid", ctx.requestId),
      );
      return;
    }
    let body: BindDeviceSessionBody;
    try {
      body = await readJsonBody<BindDeviceSessionBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (typeof body.challenge_id !== "string") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "challenge_id must be a string", ctx.requestId),
      );
      return;
    }
    if (body.signature != null && typeof body.signature !== "string") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "signature must be a string", ctx.requestId),
      );
      return;
    }
    if (body.share_proof != null && typeof body.share_proof !== "string") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "share_proof must be a string", ctx.requestId),
      );
      return;
    }
    if (body.new_device_public_key != null && typeof body.new_device_public_key !== "string") {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "new_device_public_key must be a string", ctx.requestId),
      );
      return;
    }
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    const shareProof = typeof body.share_proof === "string" ? body.share_proof.trim() : "";
    const nextPublicKey =
      typeof body.new_device_public_key === "string" ? body.new_device_public_key.trim() : "";
    if (!body.challenge_id.trim() || (!signature && !(shareProof && nextPublicKey))) {
      json(
        ctx.res,
        400,
        errorPayload(
          "DEVICE_BAD_REQUEST",
          "challenge_id and a device proof are required",
          ctx.requestId,
        ),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      const accessToken = getBearerToken(ctx.req);
      if (!userId || !accessToken || !sessionService) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const proof = await deviceService.acceptDeviceBindProof({
        userId,
        deviceId,
        tokenHash: sessionService.hashAccessToken(accessToken),
        challengeId: body.challenge_id.trim(),
        signatureB64: signature,
        shareProofB64: shareProof,
        newDevicePublicKeyB64: nextPublicKey,
      });
      const bound = await sessionService.bindAccessTokenDevice(accessToken, userId, deviceId);
      if (!bound) {
        json(
          ctx.res,
          409,
          errorPayload("DEVICE_NOT_ACTIVE", "device is not active", ctx.requestId),
        );
        return;
      }
      await deviceService.applyProvenDeviceMetadata({
        userId,
        deviceId,
        deviceName: body.device_name?.trim() || undefined,
        platform: body.platform?.trim() || undefined,
        osName: body.os_name?.trim() || undefined,
        osVersion: body.os_version?.trim() || undefined,
        appVersion: body.app_version?.trim() || undefined,
        clientType: body.client_type?.trim() || undefined,
        userAgent: body.user_agent?.trim() || undefined,
        requestIp: await getRequestIp(ctx.req, { trustedProxyHops: 0 }),
      });
      json(ctx.res, 200, {
        device_id: proof.deviceId,
        status: proof.status,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createListDevicesRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  resolveSession?: (req: IncomingMessage) => Promise<{
    deviceId: string | null;
    tokenHash: string;
  } | null>,
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
      const session = resolveSession ? await resolveSession(ctx.req) : null;
      const sessionDeviceId = session?.deviceId?.trim() ?? "";
      const realBearer = session != null && session.tokenHash !== "";
      const unboundBearer = realBearer && sessionDeviceId === "";
      const sessionDeviceIsTrusted =
        realBearer &&
        sessionDeviceId !== "" &&
        result.devices.some((row) => sameDeviceId(row.deviceId, sessionDeviceId));
      const ownDeviceOnly = realBearer && sessionDeviceId !== "" && !sessionDeviceIsTrusted;
      const fingerprint = (currentFingerprint ?? "").trim().toLowerCase();
      const visible = <T extends { deviceId: string; deviceFingerprint: string }>(rows: T[]): T[] => {
        if (unboundBearer) {
          if (!fingerprint) {
            return [];
          }
          return rows.filter((row) => row.deviceFingerprint.trim().toLowerCase() === fingerprint);
        }
        if (ownDeviceOnly) {
          return rows.filter((row) => sameDeviceId(row.deviceId, sessionDeviceId));
        }
        return rows;
      };
      json(ctx.res, 200, {
        devices: visible(result.devices).map(toWireDevice),
        pending: visible(result.pending).map(toWireDevice),
        blocked: visible(result.blocked ?? []).map(toWireDevice),
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
  sessionService?: Pick<
    SessionDeviceBinding,
    "resolveAccessToken" | "revokeSessionsForDevice" | "revokeAccessToken"
  >,
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
    const targetDeviceId = canonicalDeviceId(deviceId);
    if (!targetDeviceId) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "deviceId is invalid", ctx.requestId),
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
      const accessToken = getBearerToken(ctx.req);
      let sessionDeviceId: string | null = null;
      let fullSessionUnbound = false;
      if (accessToken && sessionService) {
        const resolved = await sessionService.resolveAccessToken(accessToken);
        sessionDeviceId = resolved?.deviceId ?? null;
        fullSessionUnbound = Boolean(
          resolved &&
            isFullSessionScope(resolved.scope) &&
            (sessionDeviceId == null || sessionDeviceId === ""),
        );
      }
      // Prefer session binding; fall back to X-Device-Id (header-auth only).
      const currentDeviceId = sessionDeviceId ?? getHeader(ctx.req, "x-device-id") ?? null;
      const allowCurrent = body.sign_out === true;
      if (fullSessionUnbound && !allowCurrent) {
        throw new DeviceServiceError(
          "DEVICE_REVOKE_CURRENT_FORBIDDEN",
          403,
          "cannot revoke the current device",
        );
      }
      if (currentDeviceId && sameDeviceId(currentDeviceId, targetDeviceId) && !allowCurrent) {
        throw new DeviceServiceError(
          "DEVICE_REVOKE_CURRENT_FORBIDDEN",
          403,
          "cannot revoke the current device",
        );
      }
      const result = await deviceService.revokeDevice(userId, targetDeviceId, body.reason);
      if (sessionService) {
        await sessionService.revokeSessionsForDevice(userId, targetDeviceId);
        // sign_out ends the caller's session only when they revoke themselves (or
        // an unbound full session that used sign_out to revoke). Revoking another
        // device must not log the approver out.
        const signingOutSelf =
          allowCurrent &&
          (fullSessionUnbound ||
            (currentDeviceId != null && sameDeviceId(currentDeviceId, targetDeviceId)));
        if (signingOutSelf && accessToken) {
          await sessionService.revokeAccessToken(accessToken);
        }
      }
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

    let body: { share_delivery_envelope?: string } = {};
    try {
      body = await readOptionalJsonObject(ctx.req);
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
      const envelopeB64 = body.share_delivery_envelope?.trim() ?? "";
      let envelope: Uint8Array | undefined;
      if (envelopeB64) {
        if (!isBase64(envelopeB64)) {
          json(
            ctx.res,
            400,
            errorPayload("DEVICE_BAD_REQUEST", "share_delivery_envelope must be base64", ctx.requestId),
          );
          return;
        }
        envelope = Uint8Array.from(Buffer.from(envelopeB64, "base64"));
      }
      const result = await deviceService.approveDevice(
        userId,
        approverDeviceId,
        deviceId,
        envelope,
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

function isBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) {
    return false;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

async function readOptionalJsonObject(
  req: IncomingMessage,
): Promise<{ share_delivery_envelope?: string }> {
  const mocked = (req as IncomingMessage & { body?: unknown }).body;
  if (mocked !== undefined) {
    if (mocked === null || typeof mocked !== "object" || Array.isArray(mocked)) {
      throw new Error("invalid json");
    }
    return mocked as { share_delivery_envelope?: string };
  }
  const asyncIterator = (req as AsyncIterable<unknown>)[Symbol.asyncIterator];
  if (typeof asyncIterator !== "function") {
    return {};
  }
  return readJsonBody(req);
}

export function createGetShareDeliveryRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  resolveSession?: (req: IncomingMessage) => Promise<{ deviceId: string | null } | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      assertOwnDevice(ctx, deviceId, await resolveCallerDeviceId(ctx.req, resolveSession));
      const delivery = await deviceService.readShareDelivery(userId, deviceId);
      json(ctx.res, 200, {
        share_delivery_envelope: Buffer.from(delivery.envelope).toString("base64"),
        expires_at: delivery.expiresAt,
      });
    } catch (error) {
      handleDeviceError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createConfirmShareDeliveryRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  resolveSession?: (req: IncomingMessage) => Promise<{ deviceId: string | null } | null>,
): RouteHandler {
  return async (ctx) => {
    const deviceId = ctx.params.deviceId;
    if (!deviceId) {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "deviceId is required", ctx.requestId));
      return;
    }
    let body: { device_share?: string };
    try {
      body = await readJsonBody(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("DEVICE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (typeof body.device_share !== "string" || !body.device_share.trim()) {
      json(
        ctx.res,
        400,
        errorPayload("DEVICE_BAD_REQUEST", "device_share is required", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      assertOwnDevice(ctx, deviceId, await resolveCallerDeviceId(ctx.req, resolveSession));
      const result = await deviceService.confirmShareDelivery(
        userId,
        deviceId,
        body.device_share.trim(),
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

async function resolveCallerDeviceId(
  req: IncomingMessage,
  resolveSession?: (req: IncomingMessage) => Promise<{ deviceId: string | null } | null>,
): Promise<string> {
  const session = resolveSession ? await resolveSession(req) : null;
  const sessionDeviceId = session?.deviceId?.trim() ?? "";
  if (sessionDeviceId) {
    return sessionDeviceId;
  }
  return getHeader(req, "x-device-id")?.trim() ?? "";
}

function assertOwnDevice(
  ctx: Parameters<RouteHandler>[0],
  deviceId: string,
  callerDeviceId: string,
): void {
  if (!callerDeviceId || !sameDeviceId(callerDeviceId, deviceId)) {
    throw new DeviceServiceError(
      "DEVICE_SHARE_DELIVERY_FORBIDDEN",
      403,
      "only the pending device can read its share delivery",
    );
  }
}

export function createRejectDeviceRoute(
  deviceService: DeviceService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  sessionService?: Pick<SessionDeviceBinding, "revokeSessionsForDevice">,
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
      if (sessionService) {
        await sessionService.revokeSessionsForDevice(
          userId,
          canonicalDeviceId(deviceId) ?? result.deviceId,
        );
      }
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
  sessionService?: Pick<SessionDeviceBinding, "revokeSessionsForDevice">,
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
      if (sessionService) {
        await sessionService.revokeSessionsForDevice(
          userId,
          canonicalDeviceId(deviceId) ?? result.deviceId,
        );
      }
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
