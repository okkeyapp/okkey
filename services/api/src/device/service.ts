import { UniqueConstraintError } from "../storage/errors.ts";
import type { DevicesRepository } from "../storage/repositories.ts";

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
  devices: Pick<DevicesRepository, "registerOrUpdate">;
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
}

export interface RegisterDeviceResult {
  deviceId: string;
  status: "trusted" | "pending_approval";
}

export class DeviceService {
  private readonly devices: DeviceServiceDeps["devices"];
  private readonly now: () => Date;

  constructor(deps: DeviceServiceDeps) {
    this.devices = deps.devices;
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

      return {
        deviceId: record.id,
        status: record.status === "trusted" ? "trusted" : "pending_approval",
      };
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
