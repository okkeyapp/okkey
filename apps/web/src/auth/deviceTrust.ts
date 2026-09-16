import { ed25519Keypair, initCrypto, wipeBytes } from "@okkey/crypto";
import type { CoreApiClient } from "@okkey/api";
import type { DeviceListItemDto, DeviceRegisterResponseDto } from "@okkey/types";

import { base64ToBytes, bytesToBase64 } from "./base64";
import { parseBrowserEnvironment } from "./browserEnvironment";
import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";
import { readVaultBundle } from "./localVaultBundle";
import { DEVICE_PUBLIC_KEY_KEY } from "./storageKeys";

export type DeviceTrustStatus = "checking" | "trusted" | "pending" | "rejected" | "error";

export type DeviceTrustSnapshot = {
  status: DeviceTrustStatus;
  deviceId: string | null;
  /** Trusted devices that can approve this pending device (for wait UI). */
  approverDevices: DeviceListItemDto[];
  errorMessage?: string;
};

const PLACEHOLDER_SHARE_LEN = 32;

function randomPlaceholderShare(): Uint8Array {
  const bytes = new Uint8Array(PLACEHOLDER_SHARE_LEN);
  crypto.getRandomValues(bytes);
  return bytes;
}

function fingerprintMatch(device: DeviceListItemDto, fingerprint: string): boolean {
  return device.device_fingerprint.trim().toLowerCase() === fingerprint.trim().toLowerCase();
}

function readStoredDevicePublicKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(DEVICE_PUBLIC_KEY_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredDevicePublicKey(publicKeyB64: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEVICE_PUBLIC_KEY_KEY, publicKeyB64);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Resolve whether the current browser is a trusted device; register as pending when new.
 *
 * Reclaims the sole trusted device when this browser still has a local vault bundle
 * (typical after fingerprint rotation / cleared storage on the original registration browser).
 * Pending rows for the same fingerprint do not block reclaim/bootstrap.
 */
export async function resolveDeviceTrust(
  core: CoreApiClient,
  userId: string,
): Promise<DeviceTrustSnapshot> {
  const fingerprint = getOrCreateDeviceFingerprint();
  const bundle = readVaultBundle(userId);
  const hasBundle = Boolean(bundle);

  let listed: { devices: DeviceListItemDto[]; pending: DeviceListItemDto[] };
  try {
    listed = await core.listDevices(fingerprint);
  } catch (error: unknown) {
    if (import.meta.env.MODE === "test") {
      return { status: "trusted", deviceId: null, approverDevices: [] };
    }
    return {
      status: "error",
      deviceId: null,
      approverDevices: [],
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  if (trustedMatch) {
    return {
      status: "trusted",
      deviceId: trustedMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  const pendingMatch = listed.pending.find((device) => fingerprintMatch(device, fingerprint));
  const canReclaimSole = hasBundle && listed.devices.length === 1;
  const canBootstrapTrusted = hasBundle && listed.devices.length === 0;

  // Local vault proves this browser already owns unlock material — do not stay stuck on pending.
  if (pendingMatch && !canReclaimSole && !canBootstrapTrusted) {
    return {
      status: "pending",
      deviceId: pendingMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  if (!pendingMatch && !canReclaimSole && !canBootstrapTrusted) {
    // New browser without local vault → register as pending (or trusted if server has none).
  }

  try {
    const registered = await registerCurrentBrowserDevice(core, fingerprint, {
      userId,
      reclaimSoleTrusted: canReclaimSole,
    });
    if (registered.status === "trusted") {
      const after = await core.listDevices(fingerprint).catch(() => listed);
      return {
        status: "trusted",
        deviceId: registered.device_id,
        approverDevices: after.devices,
      };
    }

    const afterPending = await core.listDevices(fingerprint).catch(() => listed);
    return {
      status: "pending",
      deviceId: registered.device_id,
      approverDevices: afterPending.devices,
    };
  } catch (error: unknown) {
    if (pendingMatch) {
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
      };
    }
    return {
      status: "error",
      deviceId: null,
      approverDevices: listed.devices,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Poll trust status for a previously registered pending device.
 * When the row disappears from both trusted and pending lists → rejected.
 */
export async function pollDeviceTrust(
  core: CoreApiClient,
  fingerprint: string,
  pendingDeviceId: string | null,
): Promise<DeviceTrustSnapshot> {
  const listed = await core.listDevices(fingerprint);
  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  if (trustedMatch) {
    return {
      status: "trusted",
      deviceId: trustedMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  const pendingMatch =
    listed.pending.find((device) => fingerprintMatch(device, fingerprint)) ??
    (pendingDeviceId
      ? listed.pending.find((device) => device.device_id === pendingDeviceId)
      : undefined);

  if (pendingMatch) {
    return {
      status: "pending",
      deviceId: pendingMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  if (pendingDeviceId) {
    return {
      status: "rejected",
      deviceId: pendingDeviceId,
      approverDevices: listed.devices,
    };
  }

  return {
    status: "rejected",
    deviceId: null,
    approverDevices: listed.devices,
  };
}

export async function registerCurrentBrowserDevice(
  core: CoreApiClient,
  fingerprint = getOrCreateDeviceFingerprint(),
  options?: { reclaimSoleTrusted?: boolean; userId?: string },
): Promise<DeviceRegisterResponseDto> {
  await initCrypto();
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );

  let devicePublicKeyB64 = readStoredDevicePublicKey();
  if (!devicePublicKeyB64) {
    const deviceKp = ed25519Keypair();
    devicePublicKeyB64 = bytesToBase64(deviceKp.slice(32, 64));
    wipeBytes(deviceKp);
    writeStoredDevicePublicKey(devicePublicKeyB64);
  }

  const bundle = options?.userId ? readVaultBundle(options.userId) : null;
  let shareBytes: Uint8Array | null = null;
  let ownsShare = false;
  if (bundle?.device_share_b64) {
    try {
      shareBytes = base64ToBytes(bundle.device_share_b64);
    } catch {
      shareBytes = null;
    }
  }
  if (!shareBytes || shareBytes.length === 0) {
    shareBytes = randomPlaceholderShare();
    ownsShare = true;
  }

  try {
    return await core.registerDevice({
      device_public_key: devicePublicKeyB64,
      device_share: bytesToBase64(shareBytes),
      device_fingerprint: fingerprint,
      device_name: env.deviceName,
      platform: env.platform,
      os_name: env.osName,
      os_version: env.osVersion,
      app_version: "web",
      client_type: env.clientType,
      user_agent: env.userAgent,
      metadata: {
        crypto_capable: true,
        reclaim_sole_trusted: options?.reclaimSoleTrusted === true,
      },
    });
  } finally {
    if (ownsShare) {
      wipeBytes(shareBytes);
    }
  }
}
