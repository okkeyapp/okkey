import { createHash, randomBytes } from "node:crypto";

/** Header carrying the approval-status credential. It is not a vault session. */
export const DEVICE_APPROVAL_STATUS_HEADER = "x-device-approval-token";

/** Never longer than the pending-request lifetime, and never longer than 30 minutes. */
export const DEVICE_APPROVAL_STATUS_MAX_TTL_SECONDS = 30 * 60;

export function deviceApprovalStatusTtlSeconds(requestTtlSeconds: number): number {
  const requested =
    Number.isFinite(requestTtlSeconds) && requestTtlSeconds > 0
      ? requestTtlSeconds
      : DEVICE_APPROVAL_STATUS_MAX_TTL_SECONDS;
  return Math.min(Math.floor(requested), DEVICE_APPROVAL_STATUS_MAX_TTL_SECONDS);
}

export function hashApprovalStatusToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintApprovalStatusToken(): string {
  return randomBytes(32).toString("base64url");
}

export type ApprovalDeviceStatus = "trusted" | "pending" | "revoked" | "blocked";

export interface ApprovalStatusDevice {
  id: string;
  userId: string;
  status: ApprovalDeviceStatus;
  createdAt: string;
  blockedUntil: string | null;
  deviceName: string;
  deviceFingerprint: string;
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  clientType: string;
  userAgent: string;
}

export interface ApprovalStatusTokenRecord {
  userId: string;
  deviceId: string;
  requestCreatedAt: string;
  expiresAt: string;
}

export interface DeviceApprovalStatusStore {
  /** Replace any previous credential for this device. Persist the hash only. */
  replaceToken(input: {
    tokenHash: string;
    userId: string;
    deviceId: string;
    requestCreatedAt: string;
    expiresAt: string;
  }): Promise<void>;
  findToken(tokenHash: string, nowIso: string): Promise<ApprovalStatusTokenRecord | null>;
  findDevice(userId: string, deviceId: string): Promise<ApprovalStatusDevice | null>;
  /** Re-open a rejected (revoked) device as a new pending request. */
  reopenRejected(
    userId: string,
    deviceId: string,
    nowIso: string,
  ): Promise<ApprovalStatusDevice | null>;
}

export type ApprovalStatusView = "pending" | "approved" | "rejected" | "blocked";

export interface IssuedApprovalStatusToken {
  token: string;
  expiresAt: string;
}

export interface ApprovalStatusSnapshot {
  deviceId: string;
  status: ApprovalStatusView;
  blockedUntil: string | null;
  expiresAt: string;
}

export class DeviceApprovalStatusError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "DeviceApprovalStatusError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sameInstant(left: string, right: string): boolean {
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && a === b;
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

function viewStatus(status: ApprovalDeviceStatus): ApprovalStatusView {
  if (status === "trusted") {
    return "approved";
  }
  if (status === "pending") {
    return "pending";
  }
  if (status === "blocked") {
    return "blocked";
  }
  return "rejected";
}

export class DeviceApprovalStatusService {
  private readonly store: DeviceApprovalStatusStore;
  private readonly ttlSeconds: number;
  private readonly now: () => Date;
  private notify?: (device: ApprovalStatusDevice, requestIp: string) => Promise<void>;

  constructor(deps: {
    store: DeviceApprovalStatusStore;
    /** Pending-request lifetime. The credential TTL is capped at 30 minutes. */
    requestTtlSeconds: number;
    now?: () => Date;
    notify?: (device: ApprovalStatusDevice, requestIp: string) => Promise<void>;
  }) {
    this.store = deps.store;
    this.ttlSeconds = deviceApprovalStatusTtlSeconds(deps.requestTtlSeconds);
    this.now = deps.now ?? (() => new Date());
    this.notify = deps.notify;
  }

  /** Notice email for a re-opened request. Wired after DeviceService exists. */
  onRetry(notify: (device: ApprovalStatusDevice, requestIp: string) => Promise<void>): void {
    this.notify = notify;
  }

  async issue(input: {
    userId: string;
    deviceId: string;
    requestCreatedAt: string;
  }): Promise<IssuedApprovalStatusToken> {
    const token = mintApprovalStatusToken();
    const expiresAt = new Date(this.now().getTime() + this.ttlSeconds * 1000).toISOString();
    await this.store.replaceToken({
      tokenHash: hashApprovalStatusToken(token),
      userId: input.userId,
      deviceId: input.deviceId,
      requestCreatedAt: input.requestCreatedAt,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async read(token: string, deviceId: string): Promise<ApprovalStatusSnapshot> {
    const record = await this.requireToken(token, deviceId);
    const device = await this.store.findDevice(record.userId, record.deviceId);
    if (!device) {
      throw new DeviceApprovalStatusError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    this.assertSameRequest(record, device);
    return {
      deviceId: device.id,
      status: viewStatus(device.status),
      blockedUntil: device.status === "blocked" ? device.blockedUntil : null,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * After a rejection only: open a new pending request and rotate the credential.
   * A block, an active pending request, and a trusted device are refused.
   */
  async retry(token: string, deviceId: string, requestIp: string): Promise<IssuedApprovalStatusToken & {
    deviceId: string;
  }> {
    const record = await this.requireToken(token, deviceId);
    const device = await this.store.findDevice(record.userId, record.deviceId);
    if (!device) {
      throw new DeviceApprovalStatusError("DEVICE_NOT_FOUND", 404, "device not found");
    }
    this.assertSameRequest(record, device);
    if (device.status === "blocked") {
      throw new DeviceApprovalStatusError(
        "DEVICE_BLOCKED",
        403,
        "blocked device cannot request approval",
      );
    }
    if (device.status !== "revoked") {
      throw new DeviceApprovalStatusError(
        "DEVICE_APPROVAL_NOT_REJECTED",
        409,
        "approval can be requested again only after a rejection",
      );
    }
    const nowIso = this.now().toISOString();
    const reopened = await this.store.reopenRejected(record.userId, record.deviceId, nowIso);
    if (!reopened) {
      throw new DeviceApprovalStatusError(
        "DEVICE_APPROVAL_NOT_REJECTED",
        409,
        "approval can be requested again only after a rejection",
      );
    }
    const issued = await this.issue({
      userId: reopened.userId,
      deviceId: reopened.id,
      requestCreatedAt: reopened.createdAt,
    });
    if (this.notify) {
      try {
        await this.notify(reopened, requestIp);
      } catch {
        // A new request still stands when the notice email fails.
      }
    }
    return { deviceId: reopened.id, token: issued.token, expiresAt: issued.expiresAt };
  }

  private async requireToken(token: string, deviceId: string): Promise<ApprovalStatusTokenRecord> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new DeviceApprovalStatusError("AUTH_REQUIRED", 401, "approval status token required");
    }
    const record = await this.store.findToken(
      hashApprovalStatusToken(trimmed),
      this.now().toISOString(),
    );
    if (!record) {
      throw new DeviceApprovalStatusError("AUTH_REQUIRED", 401, "approval status token rejected");
    }
    if (!sameDeviceId(record.deviceId, deviceId)) {
      throw new DeviceApprovalStatusError("DEVICE_FORBIDDEN", 403, "approval status token rejected");
    }
    return record;
  }

  private assertSameRequest(record: ApprovalStatusTokenRecord, device: ApprovalStatusDevice): void {
    if (!sameInstant(record.requestCreatedAt, device.createdAt)) {
      throw new DeviceApprovalStatusError("AUTH_REQUIRED", 401, "approval status token rejected");
    }
  }
}
