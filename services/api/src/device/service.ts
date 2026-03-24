import type { ApiConfig } from "../config.ts";
import type { EmailTemplateService } from "../email/service.ts";
import { buildEmailAppPathUrl } from "../email/service.ts";
import type { Logger } from "../logger.ts";
import type { UserRecord, UsersRepository } from "../storage/repositories.ts";
import { UniqueConstraintError } from "../storage/errors.ts";
import type { DeviceApprovalState, DevicesRepository } from "../storage/repositories.ts";

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
  devices: Pick<DevicesRepository, "registerOrUpdate" | "isTrustedDevice" | "resolveApproval">;
  config: Pick<ApiConfig, "deviceApprovalTtlSeconds" | "publicAppBaseUrl">;
  users?: Pick<UsersRepository, "findById">;
  emailTemplates?: Pick<EmailTemplateService, "sendDeviceApprovalRequest">;
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
}

export interface RegisterDeviceResult {
  deviceId: string;
  status: "trusted" | "pending_approval";
}

export interface ResolveDeviceApprovalResult {
  deviceId: string;
  status: "trusted" | "revoked";
}

export class DeviceService {
  private readonly devices: DeviceServiceDeps["devices"];
  private readonly config: DeviceServiceDeps["config"];
  private readonly users?: Pick<UsersRepository, "findById">;
  private readonly emailTemplates?: Pick<EmailTemplateService, "sendDeviceApprovalRequest">;
  private readonly log?: Pick<Logger, "warn">;
  private readonly now: () => Date;

  constructor(deps: DeviceServiceDeps) {
    this.devices = deps.devices;
    this.config = deps.config;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
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

    await this.emailTemplates.sendDeviceApprovalRequest({
      to: user.email,
      localeHints: {
        userLocale: user.locale,
        acceptLanguage: input.acceptLanguage,
      },
      variables: {
        deviceName: input.deviceName,
        platform: input.platform,
        osName: input.osName,
        requestIp: cleanString(requestIp, "unknown"),
        helpUrl: buildEmailAppPathUrl(this.config.publicAppBaseUrl, "/settings/devices"),
      },
    });
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
}

function cleanString(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : fallback;
}

function isValidFingerprint(value: string): boolean {
  return /^[a-f0-9]{32,128}$/i.test(value.trim());
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
