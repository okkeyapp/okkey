import type { ApiConfig } from "../config.ts";
import type { GeoIpLookup } from "../capsule/geoip.ts";
import type { EmailTemplateService } from "../email/service.ts";
import { buildEmailAppPathUrl } from "../email/service.ts";
import { resolveLinkBaseUrl, type PublicAppUrlResolver } from "../mail-settings/public-url.ts";
import type { Logger } from "../logger.ts";
import type { UserRecord, UsersRepository } from "../storage/repositories.ts";
import { UniqueConstraintError } from "../storage/errors.ts";
import type {
  DeviceApprovalState,
  DeviceRecord,
  DevicesRepository,
} from "../storage/repositories.ts";
import {
  PendingDeviceLimitError,
  TrustedDeviceKeyConflictError,
} from "../storage/repositories.ts";
import { splitKeyShareBWrapPublicKeys } from "@okkey/crypto";
import { assertSplitKeyShareB } from "../registration/split-key-transport-policy.ts";
import {
  APPROVAL_SHARE_MUST_BE_NEW,
  APPROVAL_SHARE_WRONG_RECIPIENT,
  approvalShareRejection,
  matchesStoredShare,
} from "./approval-share.ts";
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
    | "listDeviceShares"
    | "updateActiveDeviceMetadata"
    | "rotateActiveDevicePublicKey"
    | "requestKeyRebind"
  > &
    Partial<
      Pick<
        DevicesRepository,
        | "savePendingOneTimeKeys"
        | "listPendingOneTimeKeys"
        | "storeShareDelivery"
        | "deleteExpiredShareDeliveries"
        | "clearShareDelivery"
        | "readShareDelivery"
        | "confirmShareDelivery"
      >
    >;
  config: Pick<ApiConfig, "deviceApprovalTtlSeconds" | "publicAppBaseUrl">;
  /** Effective public origin at send time (database, otherwise env). */
  resolvePublicAppBaseUrl?: PublicAppUrlResolver;
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
  /** Trusted device id the caller says it is rebinding. Required when reclaiming. */
  previousDeviceId?: string | null;
  /** Stored fingerprint the caller says belongs to that device. Required when reclaiming. */
  previousDeviceFingerprint?: string | null;
  /** Device id on the caller's session. Required when reclaiming. */
  sessionDeviceId?: string | null;
  /**
   * After account recovery on a fresh browser: become the sole trusted device
   * with a newly minted device_share (B), revoking other trusted devices.
   */
  claimAfterRecovery?: boolean;
  /**
   * Device bound to this session when it proved the recovery key.
   * Required when `claimAfterRecovery` is set. The claim fingerprint and
   * public key must match this device.
   */
  provedDeviceId?: string;
  /**
   * Unbound recovery session: add a pending device for a new public key when
   * this fingerprint is already trusted. Does not replace the trusted keys.
   * A previous pending row for the same fingerprint is replaced.
   */
  recoveryPending?: boolean;
  /**
   * Caller access-token hash. Kept when a pending row for this fingerprint is
   * replaced so the route can bind the session to the new row.
   */
  preserveSessionTokenHash?: string;
  /** Base64 X25519 public key for this approval only. Both one-time keys are required together. */
  oneTimeX25519PublicKey?: string;
  /** Base64 ML-KEM-768 encapsulation key for this approval only. */
  oneTimeMlkemPublicKey?: string;
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
  status: "trusted" | "revoked" | "pending_approval";
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
  /** Base64. Present only while this pending device is waiting on a one-time delivery key. */
  oneTimeX25519PublicKey?: string | null;
  oneTimeMlkemPublicKey?: string | null;
  /** Base64 Ed25519 public key of the share-B device wrap, when the row is framed. */
  shareWrapEd25519PublicKey: string | null;
  /** Base64 ML-KEM-768 encapsulation key of the share-B device wrap, when the row is framed. */
  shareWrapPqPublicKey: string | null;
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
  private readonly resolvePublicAppBaseUrl?: PublicAppUrlResolver;
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
    this.resolvePublicAppBaseUrl = deps.resolvePublicAppBaseUrl;
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
      assertSplitKeyShareB(deviceShareBytes);
    } catch (error: unknown) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        error instanceof Error ? error.message : "invalid device_share",
      );
    }

    try {
      if (input.claimAfterRecovery) {
        const provedDevice = await this.requireProvedRecoveryDevice(userId, input);
        // Fingerprint and public key come from the device that proved recovery.
        // device_share stays the request value: web restore mints share B after
        // the pending registration and sends that share on this claim.
        const claimed = await this.devices.claimTrustedAfterRecovery({
          userId,
          deviceFingerprint: provedDevice.deviceFingerprint,
          deviceName: cleanString(input.deviceName, "Unknown device"),
          devicePublicKey: provedDevice.devicePublicKey,
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
          previousDeviceId: input.previousDeviceId?.trim() ?? "",
          previousDeviceFingerprint: input.previousDeviceFingerprint?.trim().toLowerCase() ?? "",
          sessionDeviceId: input.sessionDeviceId?.trim() ?? "",
        });
        if (!reclaimed) {
          throw new DeviceServiceError(
            "DEVICE_RECLAIM_PRECONDITION_FAILED",
            403,
            "sole trusted device reclaim preconditions were not met",
          );
        }
        return {
          deviceId: reclaimed.id,
          status: "trusted",
          created: true,
        };
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
        allowPendingAlongsideTrusted: input.recoveryPending === true,
        preserveSessionTokenHash: input.preserveSessionTokenHash,
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

      if (result.status === "pending_approval") {
        await this.saveOneTimeKeysIfPresent(userId, result.deviceId, input);
      }

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
      if (error instanceof PendingDeviceLimitError) {
        throw new DeviceServiceError(
          "DEVICE_PENDING_LIMIT",
          409,
          "pending device limit reached",
          { limit: error.limit },
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
    await this.devices.deleteExpiredShareDeliveries?.(userId, nowIso);
    const records = await this.devices.listByUser(userId, ["trusted", "pending", "blocked"]);
    const normalizedFingerprint = normalizeFingerprint(currentFingerprint);
    const items = await Promise.all(
      records.map((record) => this.toListItem(record, normalizedFingerprint)),
    );
    const oneTimeKeys = (await this.devices.listPendingOneTimeKeys?.(userId)) ?? [];
    const oneTimeByDevice = new Map(oneTimeKeys.map((row) => [row.deviceId, row]));
    for (const item of items) {
      const keys = oneTimeByDevice.get(item.deviceId);
      if (!keys || item.status !== "pending_approval") {
        continue;
      }
      item.oneTimeX25519PublicKey = Buffer.from(keys.x25519PublicKey).toString("base64");
      item.oneTimeMlkemPublicKey = Buffer.from(keys.mlkemPublicKey).toString("base64");
    }

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
          await resolveLinkBaseUrl(this.config.publicAppBaseUrl, this.resolvePublicAppBaseUrl),
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
    shareDelivery?: Uint8Array,
    deviceShare?: Uint8Array,
  ): Promise<ResolveDeviceApprovalResult> {
    if (shareDelivery && shareDelivery.length > 0) {
      if (await this.shareMatchesStoredDeviceShare(userId, shareDelivery)) {
        throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, APPROVAL_SHARE_MUST_BE_NEW);
      }
      return this.approveWithShareDelivery(userId, approverDeviceId, pendingDeviceId, shareDelivery);
    }
    if (!deviceShare || deviceShare.length === 0) {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, "device_share is required");
    }
    try {
      assertSplitKeyShareB(deviceShare);
    } catch (error: unknown) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        error instanceof Error ? error.message : "invalid device_share",
      );
    }
    await this.assertApprovalShareForPending(userId, pendingDeviceId, deviceShare);
    const approved = await this.resolveDeviceApproval({
      userId,
      approverDeviceId,
      pendingDeviceId,
      action: "approve",
      deviceShare,
    });
    if (approved.status === "trusted") {
      await this.devices.clearShareDelivery?.(userId, pendingDeviceId);
    }
    return approved;
  }

  async readShareDelivery(
    userId: string,
    deviceId: string,
  ): Promise<{ envelope: Uint8Array; expiresAt: string }> {
    const nowIso = this.now().toISOString();
    await this.devices.deleteExpiredShareDeliveries?.(userId, nowIso);
    const row = await this.devices.readShareDelivery?.({
      userId,
      deviceId,
      now: nowIso,
    });
    if (!row) {
      throw new DeviceServiceError(
        "DEVICE_SHARE_DELIVERY_NOT_FOUND",
        404,
        "share delivery envelope is not available",
      );
    }
    return row;
  }

  async confirmShareDelivery(
    userId: string,
    deviceId: string,
    deviceShareB64: string,
  ): Promise<ResolveDeviceApprovalResult> {
    if (!isValidBase64(deviceShareB64)) {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, "invalid device_share");
    }
    const deviceShare = Uint8Array.from(Buffer.from(deviceShareB64, "base64"));
    try {
      assertSplitKeyShareB(deviceShare);
    } catch (error: unknown) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        error instanceof Error ? error.message : "invalid device_share",
      );
    }
    const nowIso = this.now().toISOString();
    const result = await this.devices.confirmShareDelivery?.({
      userId,
      deviceId,
      deviceShare,
      now: nowIso,
    });
    if (result === "confirmed") {
      return { deviceId, status: "trusted" };
    }
    if (result === "expired") {
      throw new DeviceServiceError(
        "DEVICE_SHARE_DELIVERY_EXPIRED",
        410,
        "share delivery envelope expired",
      );
    }
    throw new DeviceServiceError(
      "DEVICE_SHARE_DELIVERY_NOT_FOUND",
      404,
      "share delivery envelope is not available",
    );
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

  private async saveOneTimeKeysIfPresent(
    userId: string,
    deviceId: string,
    input: RegisterDeviceInput,
  ): Promise<void> {
    const x25519 = input.oneTimeX25519PublicKey?.trim() ?? "";
    const mlkem = input.oneTimeMlkemPublicKey?.trim() ?? "";
    if (!x25519 && !mlkem) {
      return;
    }
    if (!x25519 || !mlkem || !isValidBase64(x25519) || !isValidBase64(mlkem)) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        "one-time delivery key must include both X25519 and ML-KEM public keys",
      );
    }
    const x25519Bytes = Uint8Array.from(Buffer.from(x25519, "base64"));
    const mlkemBytes = Uint8Array.from(Buffer.from(mlkem, "base64"));
    if (x25519Bytes.length !== 32 || mlkemBytes.length !== 1184) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        "one-time delivery key has an unexpected length",
      );
    }
    const saved = await this.devices.savePendingOneTimeKeys?.({
      userId,
      deviceId,
      x25519PublicKey: x25519Bytes,
      mlkemPublicKey: mlkemBytes,
    });
    if (saved !== true) {
      throw new DeviceServiceError(
        "DEVICE_BAD_REQUEST",
        400,
        "one-time delivery key was not stored",
      );
    }
  }

  private async shareMatchesStoredDeviceShare(
    userId: string,
    envelope: Uint8Array,
  ): Promise<boolean> {
    const stored = await this.devices.listDeviceShares(userId);
    return matchesStoredShare(envelope, stored);
  }

  private async assertApprovalShareForPending(
    userId: string,
    pendingDeviceId: string,
    deviceShare: Uint8Array,
  ): Promise<void> {
    const pending = await this.devices.findOwnedDeviceAuth(userId, pendingDeviceId);
    if (!pending) {
      return;
    }
    const stored = await this.devices.listDeviceShares(userId);
    const problem = approvalShareRejection(deviceShare, pending.deviceShare, stored);
    if (problem === "reused") {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, APPROVAL_SHARE_MUST_BE_NEW);
    }
    if (problem === "recipient") {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, APPROVAL_SHARE_WRONG_RECIPIENT);
    }
  }

  private assertShareDeliveryEnvelope(envelope: Uint8Array): void {
    // hybrid_envelope_v1 fixed header (1148) plus the AEAD tag (16).
    const minimum = 1148 + 16;
    if (
      envelope.length < minimum ||
      envelope[0] !== 1 ||
      envelope[1] !== 1 ||
      envelope[2] !== 1
    ) {
      throw new DeviceServiceError(
        "DEVICE_SHARE_DELIVERY_INVALID",
        400,
        "share delivery envelope is not a hybrid envelope",
      );
    }
  }

  private async approveWithShareDelivery(
    userId: string,
    approverDeviceId: string,
    pendingDeviceId: string,
    envelope: Uint8Array,
  ): Promise<ResolveDeviceApprovalResult> {
    this.assertShareDeliveryEnvelope(envelope);
    const trustedApprover = await this.devices.isTrustedDevice(userId, approverDeviceId);
    if (!trustedApprover) {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_ACCESS_DENIED",
        403,
        "trusted approver device required",
      );
    }
    if (!this.devices.storeShareDelivery) {
      throw new DeviceServiceError("INTERNAL_SERVER_ERROR", 500, "share delivery storage is unavailable");
    }
    const now = this.now();
    const ttlMs = this.config.deviceApprovalTtlSeconds * 1000;
    const stored = await this.devices.storeShareDelivery({
      userId,
      deviceId: pendingDeviceId,
      approverUserId: userId,
      envelope,
      now: now.toISOString(),
      pendingCreatedBefore: new Date(now.getTime() - ttlMs).toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    });
    if (stored.kind === "stored") {
      return { deviceId: pendingDeviceId, status: "pending_approval" };
    }
    if (stored.kind === "expired") {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_EXPIRED",
        410,
        "device approval challenge expired",
      );
    }
    if (stored.kind === "not_pending") {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_ALREADY_RESOLVED",
        409,
        "device approval already resolved",
      );
    }
    if (stored.kind === "missing_one_time_key") {
      throw new DeviceServiceError(
        "DEVICE_SHARE_DELIVERY_INVALID",
        400,
        "pending device has no one-time delivery key",
      );
    }
    throw new DeviceServiceError(
      "DEVICE_APPROVAL_NOT_FOUND",
      404,
      "pending device approval not found",
    );
  }

  private async resolveDeviceApproval(input: {
    userId: string;
    approverDeviceId: string;
    pendingDeviceId: string;
    action: "approve" | "reject";
    reason?: string;
    deviceShare?: Uint8Array;
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
      deviceShare: input.deviceShare,
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

    if (result.kind === "share_required") {
      throw new DeviceServiceError("DEVICE_BAD_REQUEST", 400, "device_share is required");
    }

    if (!result.device) {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_NOT_FOUND",
        404,
        "pending device approval not found",
      );
    }

    if (action === "approve" && result.kind === "already_trusted") {
      throw new DeviceServiceError(
        "DEVICE_APPROVAL_ALREADY_RESOLVED",
        409,
        "device approval already resolved",
      );
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
    const wrapPublic = record.deviceShare
      ? splitKeyShareBWrapPublicKeys(record.deviceShare)
      : null;
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
      shareWrapEd25519PublicKey: wrapPublic
        ? Buffer.from(wrapPublic.ed25519PublicKey).toString("base64")
        : null,
      shareWrapPqPublicKey: wrapPublic
        ? Buffer.from(wrapPublic.mlkemEncapsulationKey).toString("base64")
        : null,
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
    if (
      !device.deviceShare ||
      !verifyDeviceBindShareProof(device.deviceShare, message, shareProof)
    ) {
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
      assertSplitKeyShareB(deviceShareBytes);
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

  /**
   * The session device that passed `POST /account/recovery/key/prove`.
   * Register does not move a session that is already bound, so this row is
   * the device the possession signature was checked against.
   * Pending when another trusted device exists; trusted when recovery
   * registration was the account's only device.
   */
  private async requireProvedRecoveryDevice(
    userId: string,
    input: RegisterDeviceInput,
  ): Promise<{ deviceFingerprint: string; devicePublicKey: string }> {
    const deviceId = input.provedDeviceId?.trim() ?? "";
    if (!deviceId || typeof this.devices.findOwnedDeviceAuth !== "function") {
      throw new DeviceServiceError(
        "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE",
        403,
        "recovery claim requires the pending device that proved the recovery key",
      );
    }
    const device = await this.devices.findOwnedDeviceAuth(userId, deviceId);
    if (!device || (device.status !== "pending" && device.status !== "trusted")) {
      throw new DeviceServiceError(
        "RECOVERY_CLAIM_REQUIRES_PROVED_DEVICE",
        403,
        "recovery claim requires the pending device that proved the recovery key",
      );
    }
    const sameFingerprint =
      input.deviceFingerprint.trim().toLowerCase() ===
      device.deviceFingerprint.trim().toLowerCase();
    const samePublicKey = input.devicePublicKey.trim() === device.devicePublicKey.trim();
    if (!sameFingerprint || !samePublicKey) {
      throw new DeviceServiceError(
        "RECOVERY_CLAIM_DEVICE_MISMATCH",
        403,
        "recovery claim does not match the device that proved the recovery key",
      );
    }
    return {
      deviceFingerprint: device.deviceFingerprint.trim().toLowerCase(),
      devicePublicKey: device.devicePublicKey.trim(),
    };
  }

  /** True only when this user's device row is trusted. */
  async isSessionDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    return this.devices.isTrustedDevice(userId, deviceId);
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
