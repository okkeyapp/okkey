import type { ApiConfig } from "../config.ts";
import type { GeoIpLookup } from "../capsule/geoip.ts";
import type { EmailTemplateService } from "../email/service.ts";
import { buildEmailAppPathUrl } from "../email/service.ts";
import type { Logger } from "../logger.ts";
import type { UserRecord, UsersRepository } from "../storage/repositories.ts";
import { UniqueConstraintError } from "../storage/errors.ts";
import type {
  DeviceApprovalState,
  DeviceRecord,
  DevicesRepository,
} from "../storage/repositories.ts";

export class DeviceServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface DeviceServiceDeps {
  devices: Pick<
    DevicesRepository,
    | "registerOrUpdate"
    | "reclaimSoleTrusted"
    | "claimTrustedAfterRecovery"
    | "isTrustedDevice"
    | "resolveApproval"
    | "listByUser"
    | "renameDevice"
    | "revokeOwned"
    | "blockPending"
    | "unblockDevice"
    | "clearExpiredBlocks"
  >;
  config: Pick<ApiConfig, "deviceApprovalTtlSeconds" | "publicAppBaseUrl">;
  users?: Pick<UsersRepository, "findById">;
  emailTemplates?: Pick<EmailTemplateService, "sendDeviceApprovalRequest">;
  geoIp?: Pick<GeoIpLookup, "lookup">;
  log?: Pick<Logger, "warn">;
  now?: () => Date;
}

export interface RegisterDeviceInput {
  deviceFingerprint: string;
  devicePublicKey: string;
  deviceShare: string;
  deviceName: string;
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  clientType: string;
  userAgent: string;
  /** For email template locale resolution */
  acceptLanguage?: string;
  /** Rebind sole trusted device instead of creating pending (local vault reclaim). */
  reclaimSoleTrusted?: boolean;
  /**
   * After account recovery on a fresh browser: become the sole trusted device
   * with a newly minted device_share (B), revoking other trusted devices.
   */
  claimAfterRecovery?: boolean;
}

export interface RegisterDeviceResult {
  deviceId: string;
  status: "trusted" | "pending_approval" | "blocked";
  blockedUntil?: string | null;
}

export interface ResolveDeviceApprovalResult {
  deviceId: string;
  status: "trusted" | "revoked";
}

export type DeviceBlockDuration = "1h" | "1d" | "1w" | "forever";

export interface BlockDeviceResult {
  deviceId: string;
  status: "blocked";
  blockedUntil: string | null;
}

export interface UnblockDeviceResult {
  deviceId: string;
  status: "trusted" | "revoked";
}

export interface DeviceListItem {
  deviceId: string;
  deviceName: string;
  deviceFingerprint: string;
  status: "trusted" | "pending_approval" | "blocked";
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  clientType: string;
  userAgent: string;
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  approvedAt: string | null;
  isCurrent: boolean;
  approvalExpiresAt: string | null;
  blockedUntil: string | null;
}

export interface DeviceListResult {
  devices: DeviceListItem[];
  pending: DeviceListItem[];
  blocked: DeviceListItem[];
}

export interface RenameDeviceResult {
  deviceId: string;
  deviceName: string;
}

export class DeviceService {
  private readonly devices: DeviceServiceDeps["devices"];
  private readonly config: DeviceServiceDeps["config"];
  private readonly users?: Pick<UsersRepository, "findById">;
  private readonly emailTemplates?: Pick<EmailTemplateService, "sendDeviceApprovalRequest">;
  private readonly geoIp?: Pick<GeoIpLookup, "lookup">;
  private readonly log?: Pick<Logger, "warn">;
  private readonly now: () => Date;

  constructor(deps: DeviceServiceDeps) {
    this.devices = deps.devices;
    this.config = deps.config;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
    this.geoIp = deps.geoIp;
    this.log = deps.log;
    this.now = deps.now ?? (() => new Date());
  }

  async registerDevice(
    userId: string,
    requestIp: string,
    input: RegisterDeviceInput,
  ): Promise<RegisterDeviceResult> {
    if (!isValidFingerprint(input.deviceFingerprint)) {
      throw new DeviceServiceError(
        "DEVICE_INVALID_FINGERPRINT",
        400,
        "invalid device_fingerprint",
      );
    }
    if (!isValidBase64(input.devicePublicKey)) {
      throw new DeviceServiceError(
        "DEVICE_INVALID_PUBLIC_KEY",
        400,
        "invalid device_public_key",
      );
    }
    if (!isValidBase64(input.deviceShare)) {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, "invalid device_share");
    }

    const deviceShareBytes = Uint8Array.from(Buffer.from(input.deviceShare, "base64"));
    if (deviceShareBytes.length === 0) {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, "device_share is empty");
    }

    try {
      if (input.claimAfterRecovery) {
        const claimed = await this.devices.claimTrustedAfterRecovery({
          userId,
          deviceFingerprint: input.deviceFingerprint.trim().toLowerCase(),
          deviceName: cleanString(input.deviceName, "Unknown device"),
          devicePublicKey: input.devicePublicKey.trim(),
          deviceShare: deviceShareBytes,
          platform: cleanString(input.platform, "unknown"),
          osName: cleanString(input.osName, "unknown"),
          osVersion: cleanString(input.osVersion, "unknown"),
          appVersion: cleanString(input.appVersion, "unknown"),
          clientType: cleanString(input.clientType, "unknown"),
          userAgent: cleanString(input.userAgent, "unknown"),
          requestIp: cleanString(requestIp, "unknown"),
          now: this.now().toISOString(),
        });
        return {
          deviceId: claimed.id,
          status: "trusted",
        };
      }

      if (input.reclaimSoleTrusted) {
        const reclaimed = await this.devices.reclaimSoleTrusted({
          userId,
          deviceFingerprint: input.deviceFingerprint.trim().toLowerCase(),
          deviceName: cleanString(input.deviceName, "Unknown device"),
          devicePublicKey: input.devicePublicKey.trim(),
          platform: cleanString(input.platform, "unknown"),
          osName: cleanString(input.osName, "unknown"),
          osVersion: cleanString(input.osVersion, "unknown"),
          appVersion: cleanString(input.appVersion, "unknown"),
          clientType: cleanString(input.clientType, "unknown"),
          userAgent: cleanString(input.userAgent, "unknown"),
          requestIp: cleanString(requestIp, "unknown"),
          now: this.now().toISOString(),
        });
        if (reclaimed) {
          return {
            deviceId: reclaimed.id,
            status: "trusted",
          };
        }
      }

      const record = await this.devices.registerOrUpdate({
        userId,
        deviceFingerprint: input.deviceFingerprint.trim().toLowerCase(),
        deviceName: cleanString(input.deviceName, "Unknown device"),
        devicePublicKey: input.devicePublicKey.trim(),
        deviceShare: deviceShareBytes,
        platform: cleanString(input.platform, "unknown"),
        osName: cleanString(input.osName, "unknown"),
        osVersion: cleanString(input.osVersion, "unknown"),
        appVersion: cleanString(input.appVersion, "unknown"),
        clientType: cleanString(input.clientType, "unknown"),
        userAgent: cleanString(input.userAgent, "unknown"),
        requestIp: cleanString(requestIp, "unknown"),
        now: this.now().toISOString(),
      });

      if (record.status === "blocked") {
        return {
          deviceId: record.id,
          status: "blocked",
          blockedUntil: record.blockedUntil,
        };
      }

      const result: RegisterDeviceResult = {
        deviceId: record.id,
        status: record.status === "trusted" ? "trusted" : "pending_approval",
      };

      if (result.status === "pending_approval") {
        try {
          await this.notifyDeviceApprovalEmail(userId, requestIp, input);
        } catch (error: unknown) {
          this.log?.warn("[device] approval request email failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return result;
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DeviceServiceError(
          "DEVICE_DUPLICATE_CONFLICT",
          409,
          "device registration conflict",
        );
      }
      throw error;
    }
  }

  async listDevices(
    userId: string,
    currentFingerprint?: string | null,
  ): Promise<DeviceListResult> {
    const nowIso = this.now().toISOString();
    await this.devices.clearExpiredBlocks(userId, nowIso);
    const records = await this.devices.listByUser(userId, ["trusted", "pending", "blocked"]);
    const normalizedFingerprint = normalizeFingerprint(currentFingerprint);
    const items = await Promise.all(
      records.map((record) => this.toListItem(record, normalizedFingerprint)),
    );

    return {
      devices: items.filter((item) => item.status === "trusted"),
      pending: items.filter((item) => item.status === "pending_approval"),
      blocked: items.filter((item) => item.status === "blocked"),
    };
  }

  async renameDevice(
    userId: string,
    deviceId: string,
    deviceName: string,
  ): Promise<RenameDeviceResult> {
    const cleaned = cleanString(deviceName, "");
    if (!cleaned) {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, "device_name is required");
    }

    const record = await this.devices.renameDevice({
      userId,
      deviceId,
      deviceName: cleaned,
    });
    if (!record) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }

    return {
      deviceId: record.id,
      deviceName: record.deviceName,
    };
  }

  async revokeDevice(
    userId: string,
    deviceId: string,
    reason?: string,
  ): Promise<ResolveDeviceApprovalResult> {
    const record = await this.devices.revokeOwned({
      userId,
      deviceId,
      now: this.now().toISOString(),
      reason: reason ? cleanString(reason, "revoked by user") : undefined,
    });
    if (!record) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }

    return {
      deviceId: record.id,
      status: "revoked",
    };
  }

  private async notifyDeviceApprovalEmail(
    userId: string,
    requestIp: string,
    input: RegisterDeviceInput,
  ): Promise<void> {
    if (!this.emailTemplates || !this.users) {
      return;
    }
    const user: UserRecord | null = await this.users.findById(userId);
    if (!user) {
      return;
    }

    const ip = cleanString(requestIp, "unknown");
    let country: string | null = null;
    let city: string | null = null;
    if (this.geoIp) {
      try {
        const location = await this.geoIp.lookup(ip);
        country = location.country;
        city = location.city;
      } catch (error: unknown) {
        this.log?.warn("[device] geoip lookup failed for approval email", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.emailTemplates.sendDeviceApprovalRequest({
      to: user.email,
      localeHints: {
        userLocale: user.locale,
        acceptLanguage: input.acceptLanguage,
      },
      variables: {
        deviceName: input.deviceName,
        platform: `${deviceChannelLabel(input)} · ${clientTypeLabel(input.clientType)}`,
        osName: cleanString(input.osName, "unknown"),
        requestIp: ip,
        country,
        city,
        helpUrl: buildEmailAppPathUrl(
          this.config.publicAppBaseUrl,
          "/items?popup=settings|devices",
        ),
        requestedAtIso: this.now().toISOString(),
      },
    });
  }

  async blockDevice(
    userId: string,
    approverDeviceId: string,
    pendingDeviceId: string,
    duration: DeviceBlockDuration,
    reason?: string,
  ): Promise<BlockDeviceResult> {
    const trustedApprover = await this.devices.isTrustedDevice(userId, approverDeviceId);
    if (!trustedApprover) {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_ACCESS_DENIED",
        403,
        "trusted approver device required",
      );
    }

    const now = this.now();
    const blockedUntil = resolveBlockedUntil(now, duration);
    const record = await this.devices.blockPending({
      userId,
      deviceId: pendingDeviceId,
      approverDeviceId,
      now: now.toISOString(),
      blockedUntil,
      reason: reason
        ? cleanString(reason, `blocked:${duration}`)
        : `blocked:${duration}`,
    });
    if (!record) {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_NOT_FOUND",
        404,
        "pending device approval not found",
      );
    }

    return {
      deviceId: record.id,
      status: "blocked",
      blockedUntil: record.blockedUntil,
    };
  }

  async unblockDevice(
    userId: string,
    deviceId: string,
    trust: boolean,
  ): Promise<UnblockDeviceResult> {
    const record = await this.devices.unblockDevice({
      userId,
      deviceId,
      now: this.now().toISOString(),
      trust,
    });
    if (!record) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }

    return {
      deviceId: record.id,
      status: record.status === "trusted" ? "trusted" : "revoked",
    };
  }

  async approveDevice(
    userId: string,
    approverDeviceId: string,
    pendingDeviceId: string,
  ): Promise<ResolveDeviceApprovalResult> {
    return this.resolveDeviceApproval({
      userId,
      approverDeviceId,
      pendingDeviceId,
      action: "approve",
    });
  }

  async rejectDevice(
    userId: string,
    approverDeviceId: string,
    pendingDeviceId: string,
    reason?: string,
  ): Promise<ResolveDeviceApprovalResult> {
    return this.resolveDeviceApproval({
      userId,
      approverDeviceId,
      pendingDeviceId,
      action: "reject",
      reason,
    });
  }

  private async resolveDeviceApproval(input: {
    userId: string;
    approverDeviceId: string;
    pendingDeviceId: string;
    action: "approve" | "reject";
    reason?: string;
  }): Promise<ResolveDeviceApprovalResult> {
    const trustedApprover = await this.devices.isTrustedDevice(
      input.userId,
      input.approverDeviceId,
    );
    if (!trustedApprover) {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_ACCESS_DENIED",
        403,
        "trusted approver device required",
      );
    }

    const now = this.now();
    const expiresAt = new Date(
      now.getTime() - this.config.deviceApprovalTtlSeconds * 1000,
    ).toISOString();

    const result = await this.devices.resolveApproval({
      deviceId: input.pendingDeviceId,
      userId: input.userId,
      action: input.action,
      now: now.toISOString(),
      expiresAt,
      approvedBy: input.userId,
      approverDeviceId: input.approverDeviceId,
      rejectReason: input.reason ? cleanString(input.reason, "rejected by user") : undefined,
    });

    return this.mapApprovalResult(input.action, result);
  }

  private mapApprovalResult(
    action: "approve" | "reject",
    result: DeviceApprovalState,
  ): ResolveDeviceApprovalResult {
    if (result.kind === "not_found") {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_NOT_FOUND",
        404,
        "pending device approval not found",
      );
    }

    if (result.kind === "access_denied") {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_ACCESS_DENIED",
        403,
        "device approval access denied",
      );
    }

    if (result.kind === "expired") {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_EXPIRED",
        410,
        "device approval challenge expired",
      );
    }

    if (!result.device) {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_NOT_FOUND",
        404,
        "pending device approval not found",
      );
    }

    if (action === "approve" && result.kind === "already_trusted") {
      return {
        deviceId: result.device.id,
        status: "trusted",
      };
    }
    if (action === "reject" && result.kind === "already_revoked") {
      return {
        deviceId: result.device.id,
        status: "revoked",
      };
    }

    if (result.kind === "already_trusted" || result.kind === "already_revoked") {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_ALREADY_RESOLVED",
        409,
        "device approval already resolved",
      );
    }

    return {
      deviceId: result.device.id,
      status: result.device.status === "trusted" ? "trusted" : "revoked",
    };
  }

  private async toListItem(
    record: DeviceRecord,
    currentFingerprint: string | null,
  ): Promise<DeviceListItem> {
    const ipAddress = record.ipLast || record.ipFirst || "unknown";
    let country: string | null = null;
    let city: string | null = null;
    if (this.geoIp) {
      try {
        const location = await this.geoIp.lookup(ipAddress);
        country = location.country;
        city = location.city;
      } catch (error: unknown) {
        this.log?.warn("[device] geoip lookup failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const isPending = record.status === "pending";
    const isBlocked = record.status === "blocked";
    return {
      deviceId: record.id,
      deviceName: record.deviceName,
      deviceFingerprint: record.deviceFingerprint,
      status: isPending ? "pending_approval" : isBlocked ? "blocked" : "trusted",
      platform: record.platform,
      osName: record.osName,
      osVersion: record.osVersion,
      appVersion: record.appVersion,
      clientType: record.clientType,
      userAgent: record.userAgent,
      ipAddress,
      country,
      city,
      createdAt: record.createdAt,
      lastSeenAt: record.lastSeenAt,
      approvedAt: record.approvedAt,
      isCurrent:
        currentFingerprint !== null &&
        record.deviceFingerprint.toLowerCase() === currentFingerprint &&
        record.status === "trusted",
      approvalExpiresAt: isPending
        ? new Date(
            new Date(record.createdAt).getTime() +
              this.config.deviceApprovalTtlSeconds * 1000,
          ).toISOString()
        : null,
      blockedUntil: isBlocked ? record.blockedUntil : null,
    };
  }
}

function resolveBlockedUntil(now: Date, duration: DeviceBlockDuration): string | null {
  if (duration === "forever") {
    return null;
  }
  const ms =
    duration === "1h"
      ? 60 * 60 * 1000
      : duration === "1d"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms).toISOString();
}

function cleanString(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : fallback;
}

function deviceChannelLabel(input: {
  platform: string;
  clientType: string;
  deviceName: string;
}): string {
  const fromName = input.deviceName.trim().match(/^(Web|Mobile|Desktop|Extension)\b/u);
  if (fromName?.[1]) {
    return fromName[1];
  }
  const clientType = input.clientType.trim().toLowerCase();
  if (clientType.includes("extension")) return "Extension";
  if (input.platform.trim().toLowerCase() === "mobile" || clientType.includes("mobile")) {
    return "Mobile";
  }
  if (clientType === "desktop") return "Desktop";
  return "Web";
}

function clientTypeLabel(clientType: string): string {
  const value = clientType.trim().toLowerCase();
  const labels: Record<string, string> = {
    chrome: "Chrome",
    safari: "Safari",
    firefox: "Firefox",
    edge: "Edge",
    opera: "Opera",
    yandex: "Yandex",
    vivaldi: "Vivaldi",
    tor: "Tor",
    web: "Web",
    mobile: "App",
    desktop: "App",
    extension: "Extension",
  };
  return labels[value] ?? (value || "App");
}

function normalizeFingerprint(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return isValidFingerprint(trimmed) ? trimmed : null;
}

function isValidFingerprint(value: string): boolean {
  const trimmed = value.trim();
  // Legacy random hex (32–128 chars).
  if (/^[a-f0-9]{32,128}$/i.test(trimmed)) {
    return true;
  }
  // Structured: web_app-chrome-macos-14.5 (no IP/geo).
  return /^(web_app|mobile_app|desktop_app|extension)-[a-z0-9]+-[a-z0-9]+-[a-z0-9.]+$/i.test(
    trimmed,
  );
}

function isValidBase64(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length % 4 !== 0) {
    return false;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return false;
  }

  try {
    return Buffer.from(trimmed, "base64").length > 0;
  } catch {
    return false;
  }
}
