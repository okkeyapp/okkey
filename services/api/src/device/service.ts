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
import { TrustedDeviceKeyConflictError } from "../storage/repositories.ts";
import { assertOpaqueSplitKeyShare } from "../registration/split-key-transport-policy.ts";
import {
  DEVICE_BIND_CHALLENGE_TTL_SECONDS,
  deviceBindChallengeKey,
  issueDeviceBindChallenge,
  MemoryDeviceBindChallengeStore,
  verifyDeviceBindShareProof,
  verifyDeviceBindSignature,
  type DeviceBindChallengeStore,
} from "./bind-proof.ts";

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
    | "findOwnedDeviceAuth"
    | "updateActiveDeviceMetadata"
    | "rotateActiveDevicePublicKey"
    | "requestKeyRebind"
  >;
  config: Pick<ApiConfig, "deviceApprovalTtlSeconds" | "publicAppBaseUrl">;
  users?: Pick<UsersRepository, "findById">;
  emailTemplates?: Pick<EmailTemplateService, "sendDeviceApprovalRequest">;
  geoIp?: Pick<GeoIpLookup, "lookup">;
  log?: Pick<Logger, "warn">;
  now?: () => Date;
  bindChallenges?: DeviceBindChallengeStore;
  verifyDeviceSignature?: (publicKeyB64: string, message: Uint8Array, signatureB64: string) => boolean;
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
  /** Explicit UI locale from JSON body (preferred over Accept-Language). */
  locale?: string;
  /** For email template locale resolution (often ignored by browsers — use `locale`). */
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
  /** True only when this call inserted the device row. Existing devices need a signed bind. */
  created: boolean;
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
  private readonly bindChallenges: DeviceBindChallengeStore;
  private readonly verifyDeviceSignature: (
    publicKeyB64: string,
    message: Uint8Array,
    signatureB64: string,
  ) => boolean;

  constructor(deps: DeviceServiceDeps) {
    this.devices = deps.devices;
    this.config = deps.config;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
    this.geoIp = deps.geoIp;
    this.log = deps.log;
    this.now = deps.now ?? (() => new Date());
    this.bindChallenges =
      deps.bindChallenges ?? new MemoryDeviceBindChallengeStore(() => this.now().getTime());
    this.verifyDeviceSignature = deps.verifyDeviceSignature ?? verifyDeviceBindSignature;
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
    try {
      // q2-6: share B is opaque 32-byte local material — reject hybrid envelopes.
      assertOpaqueSplitKeyShare(deviceShareBytes, "device_share");
    } catch (error: unknown) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        error instanceof Error ? error.message : "invalid device_share",
      );
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
          created: true,
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
            created: true,
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
          created: false,
        };
      }

      const result: RegisterDeviceResult = {
        deviceId: record.id,
        status: record.status === "trusted" ? "trusted" : "pending_approval",
        created: record.created === true,
      };

      if (result.status === "pending_approval" && record.sendApprovalEmail !== false) {
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
      if (error instanceof TrustedDeviceKeyConflictError) {
        throw new DeviceServiceError(
          "DEVICE_FINGERPRINT_ALREADY_TRUSTED",
          409,
          "trusted device keys cannot be replaced",
        );
      }
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

    const requestedAt = this.now();
    const expiresAt = new Date(
      requestedAt.getTime() + this.config.deviceApprovalTtlSeconds * 1000,
    );
    await this.emailTemplates.sendDeviceApprovalRequest({
      to: user.email,
      localeHints: {
        userLocale: user.locale,
        explicitLocale: input.locale,
        acceptLanguage: input.acceptLanguage,
      },
      variables: {
        deviceName: input.deviceName,
        platform: `${deviceChannelLabel({
          platform: input.platform,
          clientType: input.clientType,
          deviceName: input.deviceName,
          deviceFingerprint: input.deviceFingerprint,
        })} · ${clientTypeLabel(input.clientType)}`,
        osName: cleanString(input.osName, "unknown"),
        requestIp: ip,
        country,
        city,
        helpUrl: buildEmailAppPathUrl(
          this.config.publicAppBaseUrl,
          "/items?popup=settings|devices",
        ),
        requestedAtIso: requestedAt.toISOString(),
        expiresAtIso: expiresAt.toISOString(),
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

  async issueDeviceBindChallenge(input: {
    userId: string;
    deviceId: string;
    tokenHash: string;
  }): Promise<{ challengeId: string; challengeB64: string; expiresAt: string }> {
    const device = await this.requireActiveDevice(input.userId, input.deviceId);
    const issued = issueDeviceBindChallenge({
      deviceId: device.id,
      tokenHash: input.tokenHash,
      nowMs: this.now().getTime(),
    });
    await this.bindChallenges.put(
      deviceBindChallengeKey(input.tokenHash, device.id, issued.challengeId),
      JSON.stringify(issued.record),
      DEVICE_BIND_CHALLENGE_TTL_SECONDS,
    );
    return {
      challengeId: issued.challengeId,
      challengeB64: Buffer.from(issued.message).toString("base64"),
      expiresAt: issued.expiresAt,
    };
  }

  /**
   * Consume a one-time bind challenge and check a device-key signature or a
   * vault-share proof. Does not change keys or session binding.
   */
  async proveDevicePossession(input: {
    userId: string;
    deviceId: string;
    tokenHash: string;
    challengeId: string;
    signatureB64?: string;
    shareProofB64?: string;
  }): Promise<{ deviceId: string; status: "trusted" | "pending"; proof: "signature" | "share" }> {
    const device = await this.requireActiveDevice(input.userId, input.deviceId);
    const raw = await this.bindChallenges.take(
      deviceBindChallengeKey(input.tokenHash, device.id, input.challengeId),
    );
    if (!raw) {
      throw new DeviceServiceError(
        "DEVICE_BIND_CHALLENGE_INVALID",
        401,
        "device bind challenge is invalid or expired",
      );
    }
    let record: { messageB64?: string; deviceId?: string; tokenHash?: string; expiresAtMs?: number };
    try {
      record = JSON.parse(raw) as typeof record;
    } catch {
      throw new DeviceServiceError(
        "DEVICE_BIND_CHALLENGE_INVALID",
        401,
        "device bind challenge is invalid or expired",
      );
    }
    if (
      record.deviceId !== device.id ||
      record.tokenHash !== input.tokenHash ||
      typeof record.messageB64 !== "string" ||
      typeof record.expiresAtMs !== "number" ||
      record.expiresAtMs <= this.now().getTime()
    ) {
      throw new DeviceServiceError(
        "DEVICE_BIND_CHALLENGE_INVALID",
        401,
        "device bind challenge is invalid or expired",
      );
    }
    const message = new Uint8Array(Buffer.from(record.messageB64, "base64"));
    const signature = input.signatureB64?.trim() ?? "";
    if (signature) {
      const ok = this.verifyDeviceSignature(device.devicePublicKey, message, signature);
      if (!ok) {
        throw new DeviceServiceError(
          "DEVICE_BIND_PROOF_INVALID",
          403,
          "device key signature is invalid",
        );
      }
      return {
        deviceId: device.id,
        status: device.status === "pending" ? "pending" : "trusted",
        proof: "signature",
      };
    }

    const shareProof = input.shareProofB64?.trim() ?? "";
    if (!shareProof) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        "challenge_id and a device proof are required",
      );
    }
    if (!verifyDeviceBindShareProof(device.deviceShare, message, shareProof)) {
      throw new DeviceServiceError(
        "DEVICE_BIND_PROOF_INVALID",
        403,
        "device share proof is invalid",
      );
    }
    return {
      deviceId: device.id,
      status: device.status === "pending" ? "pending" : "trusted",
      proof: "share",
    };
  }

  async acceptDeviceBindProof(input: {
    userId: string;
    deviceId: string;
    tokenHash: string;
    challengeId: string;
    signatureB64?: string;
    shareProofB64?: string;
    newDevicePublicKeyB64?: string;
  }): Promise<{ deviceId: string; status: "trusted" | "pending_approval" }> {
    const signature = input.signatureB64?.trim() ?? "";
    const shareProof = input.shareProofB64?.trim() ?? "";
    const nextPublicKey = input.newDevicePublicKeyB64?.trim() ?? "";
    if (!signature && shareProof) {
      const publicKeyBytes = Buffer.from(nextPublicKey, "base64");
      if (
        !nextPublicKey ||
        publicKeyBytes.length !== 32 ||
        publicKeyBytes.toString("base64").replace(/=+$/, "") !== nextPublicKey.replace(/=+$/, "")
      ) {
        throw new DeviceServiceError(
          "DEVICE_BAD_REQUEST",
          400,
          "new_device_public_key is invalid",
        );
      }
    }
    const proved = await this.proveDevicePossession(input);
    if (proved.proof === "signature") {
      return {
        deviceId: proved.deviceId,
        status: proved.status === "pending" ? "pending_approval" : "trusted",
      };
    }
    if (!this.devices.rotateActiveDevicePublicKey) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    const rotated = await this.devices.rotateActiveDevicePublicKey({
      userId: input.userId,
      deviceId: proved.deviceId,
      devicePublicKey: nextPublicKey,
      now: this.now().toISOString(),
    });
    if (!rotated) {
      throw new DeviceServiceError("DEVICE_NOT_ACTIVE", 409, "device is not active");
    }
    return {
      deviceId: proved.deviceId,
      status: proved.status === "pending" ? "pending_approval" : "trusted",
    };
  }

  async applyProvenDeviceMetadata(input: {
    userId: string;
    deviceId: string;
    deviceName?: string;
    platform?: string;
    osName?: string;
    osVersion?: string;
    appVersion?: string;
    clientType?: string;
    userAgent?: string;
    requestIp?: string;
  }): Promise<void> {
    if (!this.devices.updateActiveDeviceMetadata) {
      return;
    }
    await this.devices.updateActiveDeviceMetadata({
      userId: input.userId,
      deviceId: input.deviceId,
      now: this.now().toISOString(),
      deviceName: input.deviceName,
      platform: input.platform,
      osName: input.osName,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
      clientType: input.clientType,
      userAgent: input.userAgent,
      requestIp: input.requestIp,
    });
  }

  /**
   * Replace lost device signing keys and demote to pending for another trusted
   * device to approve. Sole-device accounts must use account recovery instead.
   */
  async requestDeviceKeyRebind(
    userId: string,
    requestIp: string,
    input: RegisterDeviceInput & {
      deviceId: string;
      tokenHash: string;
      challengeId: string;
      signatureB64?: string;
      shareProofB64?: string;
    },
  ): Promise<RegisterDeviceResult> {
    if (!this.devices.requestKeyRebind) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    const owned = await this.devices.findOwnedDeviceAuth?.(userId, input.deviceId);
    if (!owned) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    const claimed = input.deviceFingerprint.trim().toLowerCase();
    const stored = owned.deviceFingerprint.trim().toLowerCase();
    if (!claimed || claimed === "unknown" || claimed !== stored) {
      throw new DeviceServiceError(
        "DEVICE_REBIND_FINGERPRINT_MISMATCH",
        403,
        "device key rebind is only allowed for this session fingerprint",
      );
    }
    await this.proveDevicePossession({
      userId,
      deviceId: input.deviceId,
      tokenHash: input.tokenHash,
      challengeId: input.challengeId,
      signatureB64: input.signatureB64,
      shareProofB64: input.shareProofB64,
    });
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
    try {
      assertOpaqueSplitKeyShare(deviceShareBytes, "device_share");
    } catch (error: unknown) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        error instanceof Error ? error.message : "invalid device_share",
      );
    }

    const result = await this.devices.requestKeyRebind({
      userId,
      deviceId: input.deviceId,
      devicePublicKey: input.devicePublicKey.trim(),
      deviceShare: deviceShareBytes,
      deviceName: cleanString(input.deviceName, "Unknown device"),
      platform: cleanString(input.platform, "unknown"),
      osName: cleanString(input.osName, "unknown"),
      osVersion: cleanString(input.osVersion, "unknown"),
      appVersion: cleanString(input.appVersion, "unknown"),
      clientType: cleanString(input.clientType, "unknown"),
      userAgent: cleanString(input.userAgent, "unknown"),
      requestIp: cleanString(requestIp, "unknown"),
      now: this.now().toISOString(),
    });

    if (result.kind === "not_found") {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    if (result.kind === "requires_recovery") {
      throw new DeviceServiceError(
        "DEVICE_REBIND_REQUIRES_RECOVERY",
        409,
        "device key rebind requires account recovery when no other trusted device can approve",
      );
    }

    if (result.sendApprovalEmail !== false) {
      try {
        await this.notifyDeviceApprovalEmail(userId, requestIp, input);
      } catch (error: unknown) {
        this.log?.warn("[device] key-rebind approval email failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      deviceId: result.device.id,
      status: "pending_approval",
      created: false,
    };
  }

  private async requireActiveDevice(userId: string, deviceId: string) {
    if (!this.devices.findOwnedDeviceAuth) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    const device = await this.devices.findOwnedDeviceAuth(userId, deviceId);
    if (!device) {
      throw new DeviceServiceError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    if (device.status !== "trusted" && device.status !== "pending") {
      throw new DeviceServiceError("DEVICE_NOT_ACTIVE", 409, "device is not active");
    }
    return device;
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

/** Channel labels aligned with UI `formatDeviceChannel` (`@okkey/ui`). */
function deviceChannelLabel(input: {
  platform: string;
  clientType: string;
  deviceName: string;
  deviceFingerprint?: string;
}): string {
  const fingerprint = (input.deviceFingerprint ?? "").trim().toLowerCase();
  if (fingerprint.startsWith("extension-")) return "Extension";
  if (fingerprint.startsWith("mobile_app-")) return "Mobile";
  if (fingerprint.startsWith("desktop_app-")) return "Desktop";
  if (fingerprint.startsWith("web_app-")) return "Web";

  const fromName = input.deviceName.trim().match(/^(Web|Mobile|Desktop|Extension)\b/u);
  if (fromName?.[1]) {
    return fromName[1];
  }
  const clientType = input.clientType.trim().toLowerCase();
  if (clientType.includes("extension")) return "Extension";
  if (input.platform.trim().toLowerCase() === "mobile" || clientType.includes("mobile")) {
    return "Mobile";
  }
  if (clientType.includes("desktop")) return "Desktop";
  return "Web";
}

/** Client labels aligned with UI `formatClientLabelFromType` (`@okkey/ui`). */
function clientTypeLabel(clientType: string): string {
  const value = clientType.trim().toLowerCase();
  if (!value || value === "unknown") return "App";
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
    web_app: "Web",
    mobile: "App",
    mobile_app: "App",
    desktop: "App",
    desktop_app: "App",
    extension: "Extension",
  };
  if (labels[value]) return labels[value];
  if (value.includes("extension")) return "Extension";
  if (value.includes("mobile") || value.includes("desktop")) return "App";
  if (value.includes("browser") || value.includes("web")) return "Web";
  return value;
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
