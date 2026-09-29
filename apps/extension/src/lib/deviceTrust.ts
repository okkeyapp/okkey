import type { CoreApiClient } from "@okkey/api";
import type { DeviceListItemDto, DeviceRegisterResponseDto } from "@okkey/types";

import { randomDevicePublicKeyB64, randomDeviceShareB64 } from "./api";
import { parseBrowserEnvironment } from "./browserEnvironment";
import {
  readDeviceFingerprint,
  readDevicePublicKey,
  writeDeviceFingerprint,
  writeDeviceId,
  writeDevicePublicKey,
} from "./storage";

export type DeviceTrustStatus =
  | "checking"
  | "trusted"
  | "pending"
  | "blocked"
  | "rejected"
  | "error";

export type DeviceTrustSnapshot = {
  status: DeviceTrustStatus;
  deviceId: string | null;
  approverDevices: DeviceListItemDto[];
  errorMessage?: string;
  blockedUntil?: string | null;
};

function fingerprintMatch(device: DeviceListItemDto, fingerprint: string): boolean {
  return device.device_fingerprint.trim().toLowerCase() === fingerprint.trim().toLowerCase();
}

async function ensureFingerprint(): Promise<string> {
  const existing = await readDeviceFingerprint();
  if (existing) {
    return existing;
  }
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    { channel: "Extension" },
  );
  await writeDeviceFingerprint(env.fingerprint);
  return env.fingerprint;
}

export async function registerExtensionDevice(
  core: CoreApiClient,
): Promise<DeviceRegisterResponseDto> {
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    { channel: "Extension" },
  );
  const fingerprint = await ensureFingerprint();

  let devicePublicKeyB64 = await readDevicePublicKey();
  if (!devicePublicKeyB64) {
    devicePublicKeyB64 = randomDevicePublicKeyB64();
    await writeDevicePublicKey(devicePublicKeyB64);
  }

  const result = await core.registerDevice({
    device_public_key: devicePublicKeyB64,
    device_share: randomDeviceShareB64(),
    device_fingerprint: fingerprint,
    device_name: env.deviceName,
    platform: env.platform,
    os_name: env.osName,
    os_version: env.osVersion,
    app_version: "extension",
    client_type: env.clientType,
    user_agent: env.userAgent,
    metadata: {
      crypto_capable: true,
    },
  });
  await writeDeviceId(result.device_id);
  return result;
}

/** Best-effort revoke so web pending "New device" popup disappears on extension sign-out. */
export async function revokeExtensionDeviceBestEffort(
  core: CoreApiClient,
  deviceId: string | null | undefined,
): Promise<void> {
  const id = deviceId?.trim();
  if (!id) {
    return;
  }
  try {
    await core.revokeDevice(id, "signed out from extension");
  } catch {
    // Ignore — local wipe still proceeds.
  }
}

export async function resolveExtensionDeviceTrust(
  core: CoreApiClient,
): Promise<DeviceTrustSnapshot> {
  const fingerprint = await ensureFingerprint();

  let listed: {
    devices: DeviceListItemDto[];
    pending: DeviceListItemDto[];
    blocked?: DeviceListItemDto[];
  };
  try {
    listed = await core.listDevices(fingerprint);
  } catch (error: unknown) {
    return {
      status: "error",
      deviceId: null,
      approverDevices: [],
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  const blockedMatch = (listed.blocked ?? []).find((device) =>
    fingerprintMatch(device, fingerprint),
  );
  if (blockedMatch) {
    const untilMs =
      blockedMatch.blocked_until == null ? null : new Date(blockedMatch.blocked_until).getTime();
    if (untilMs === null || untilMs > Date.now()) {
      return {
        status: "blocked",
        deviceId: blockedMatch.device_id,
        approverDevices: listed.devices,
        blockedUntil: blockedMatch.blocked_until ?? null,
      };
    }
  }

  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  if (trustedMatch) {
    await writeDeviceId(trustedMatch.device_id);
    return {
      status: "trusted",
      deviceId: trustedMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  const pendingMatch = listed.pending.find((device) => fingerprintMatch(device, fingerprint));
  if (pendingMatch) {
    await writeDeviceId(pendingMatch.device_id);
    return {
      status: "pending",
      deviceId: pendingMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  try {
    const registered = await registerExtensionDevice(core);
    if (registered.status === "trusted") {
      return {
        status: "trusted",
        deviceId: registered.device_id,
        approverDevices: listed.devices,
      };
    }
    if (registered.status === "blocked") {
      return {
        status: "blocked",
        deviceId: registered.device_id,
        approverDevices: listed.devices,
        blockedUntil: registered.blocked_until ?? null,
      };
    }
    const after = await core.listDevices(fingerprint).catch(() => listed);
    return {
      status: "pending",
      deviceId: registered.device_id,
      approverDevices: after.devices,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      deviceId: null,
      approverDevices: listed.devices,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function pollExtensionDeviceTrust(
  core: CoreApiClient,
  pendingDeviceId: string | null,
): Promise<DeviceTrustSnapshot> {
  const fingerprint = await ensureFingerprint();
  const listed = await core.listDevices(fingerprint);

  const blockedMatch =
    (pendingDeviceId
      ? (listed.blocked ?? []).find((d) => d.device_id === pendingDeviceId)
      : undefined) ??
    (listed.blocked ?? []).find((device) => fingerprintMatch(device, fingerprint));

  if (blockedMatch) {
    const untilMs =
      blockedMatch.blocked_until == null ? null : new Date(blockedMatch.blocked_until).getTime();
    if (untilMs === null || untilMs > Date.now()) {
      return {
        status: "blocked",
        deviceId: blockedMatch.device_id,
        approverDevices: listed.devices,
        blockedUntil: blockedMatch.blocked_until ?? null,
      };
    }
  }

  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  if (trustedMatch) {
    await writeDeviceId(trustedMatch.device_id);
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

  return {
    status: "rejected",
    deviceId: pendingDeviceId,
    approverDevices: listed.devices,
  };
}
