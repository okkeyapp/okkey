import type { CoreApiClient } from "@okkey/api";
import { initCrypto } from "@okkey/crypto";
import type { DeviceListItemDto, DeviceRegisterResponseDto } from "@okkey/types";

import { isUnauthorizedApiError } from "./apiErrors.ts";
import { parseBrowserEnvironment } from "./browserEnvironment.ts";
import { randomDeviceShareB64 } from "./deviceKeyPlaceholders.ts";
import {
  clearExtensionDeviceSigningKey,
  ensureExtensionDeviceSigningPublicKey,
  hasExtensionDeviceSigningKey,
  rotateExtensionDeviceSigningKey,
  signExtensionDeviceBindChallenge,
} from "./deviceSigningKey.ts";
import { loadExtensionLocale } from "./locale.ts";
import {
  clearDeviceDeferred,
  clearExtensionSessionArea,
  clearSessionAfterLostDeviceTrust,
  readDeviceDeferred,
  readDeviceFingerprint,
  readDeviceId,
  writeDeviceDeferred,
  writeDeviceFingerprint,
  writeDeviceId,
} from "./storage.ts";

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
  needsRecovery?: boolean;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function bindExtensionDeviceWithProof(
  core: CoreApiClient,
  deviceId: string,
): Promise<void> {
  if (!(await hasExtensionDeviceSigningKey())) {
    throw new Error("device private key is missing");
  }
  await initCrypto();
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    { channel: "Extension" },
  );
  const challenge = await core.createDeviceBindChallenge(deviceId);
  const message = Uint8Array.from(atob(challenge.challenge), (c) => c.charCodeAt(0));
  const signature = await signExtensionDeviceBindChallenge(message);
  await core.bindDeviceSession(deviceId, {
    challenge_id: challenge.challenge_id,
    signature: bytesToBase64(signature),
    device_name: env.deviceName,
    platform: env.platform,
    os_name: env.osName,
    os_version: env.osVersion,
    app_version: "extension",
    client_type: env.clientType,
    user_agent: env.userAgent,
  });
}

async function requestExtensionKeyRebind(
  core: CoreApiClient,
  deviceId: string,
  fingerprint: string,
): Promise<DeviceRegisterResponseDto> {
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    { channel: "Extension" },
  );
  const publicKeyB64 = await rotateExtensionDeviceSigningKey();
  const locale = await loadExtensionLocale();
  return core.requestDeviceKeyRebind(deviceId, {
    device_public_key: publicKeyB64,
    device_share: randomDeviceShareB64(),
    device_fingerprint: fingerprint,
    device_name: env.deviceName,
    platform: env.platform,
    os_name: env.osName,
    os_version: env.osVersion,
    app_version: "extension",
    client_type: env.clientType,
    user_agent: env.userAgent,
    locale,
  });
}

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
  await initCrypto();
  const devicePublicKeyB64 = await ensureExtensionDeviceSigningPublicKey();

  const locale = await loadExtensionLocale();
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
    // Explicit body locale: browsers ignore Accept-Language set via fetch.
    locale,
    metadata: {
      crypto_capable: true,
    },
  });
  await writeDeviceId(result.device_id);
  await clearDeviceDeferred();
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
    // sign_out allows revoking the caller device (blocked by default on the API).
    await core.revokeDevice(id, "signed out from extension", {
      signOut: true,
      callerDeviceId: id,
    });
  } catch {
    // Ignore — local wipe still proceeds.
  }
}

export async function markExtensionDeviceDeferred(deviceId: string | null): Promise<void> {
  await writeDeviceDeferred(deviceId);
}

/**
 * Resolve whether this extension install is trusted; register as pending when new.
 *
 * After a trusted device dismisses ("Не сейчас"), we keep a deferred flag and do **not**
 * auto-register again — mirrors web rejected UX until explicit retry.
 */
export async function resolveExtensionDeviceTrust(
  core: CoreApiClient,
  options?: { forceRegister?: boolean },
): Promise<DeviceTrustSnapshot> {
  const fingerprint = await ensureFingerprint();
  const deferred = options?.forceRegister ? null : await readDeviceDeferred();
  const previousDeviceId = await readDeviceId();

  let listed: {
    devices: DeviceListItemDto[];
    pending: DeviceListItemDto[];
    blocked?: DeviceListItemDto[];
  };
  try {
    listed = await core.listDevices(fingerprint);
  } catch (error: unknown) {
    // Let the popup wipe local state on expired/revoked Bearer tokens.
    if (isUnauthorizedApiError(error)) {
      throw error;
    }
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
      await clearDeviceDeferred();
      await clearExtensionDeviceSigningKey();
      // Lost trusted status (blocked) — do not keep vaultKey in session storage.
      await clearSessionAfterLostDeviceTrust(previousDeviceId);
      return {
        status: "blocked",
        deviceId: blockedMatch.device_id,
        approverDevices: listed.devices,
        blockedUntil: blockedMatch.blocked_until ?? null,
      };
    }
  }

  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  const otherTrustedCount = listed.devices.filter(
    (device) => !trustedMatch || device.device_id !== trustedMatch.device_id,
  ).length;

  if (trustedMatch) {
    if (!(await hasExtensionDeviceSigningKey())) {
      if (otherTrustedCount < 1) {
        return {
          status: "error",
          deviceId: trustedMatch.device_id,
          approverDevices: listed.devices,
          needsRecovery: true,
          errorMessage: "DEVICE_REBIND_REQUIRES_RECOVERY",
        };
      }
      try {
        const rebound = await requestExtensionKeyRebind(
          core,
          trustedMatch.device_id,
          fingerprint,
        );
        await writeDeviceId(rebound.device_id);
        await clearDeviceDeferred();
        return {
          status: "pending",
          deviceId: rebound.device_id,
          approverDevices: listed.devices.filter((d) => d.device_id !== rebound.device_id),
        };
      } catch (error: unknown) {
        return {
          status: "error",
          deviceId: trustedMatch.device_id,
          approverDevices: listed.devices,
          needsRecovery: true,
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
    }
    try {
      await bindExtensionDeviceWithProof(core, trustedMatch.device_id);
      await writeDeviceId(trustedMatch.device_id);
      await clearDeviceDeferred();
      return {
        status: "trusted",
        deviceId: trustedMatch.device_id,
        approverDevices: listed.devices,
      };
    } catch (error: unknown) {
      return {
        status: "error",
        deviceId: trustedMatch.device_id,
        approverDevices: listed.devices,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Previously known install is no longer trusted (revoked / removed). Drop unlock
  // session and pending-save material so a later re-approval cannot restore vaultKey
  // without master password / PIN. Keep account session for pending approval UX.
  await clearSessionAfterLostDeviceTrust(previousDeviceId);

  const pendingMatch = listed.pending.find((device) => fingerprintMatch(device, fingerprint));
  if (pendingMatch) {
    if (!(await hasExtensionDeviceSigningKey())) {
      if (listed.devices.length < 1) {
        return {
          status: "pending",
          deviceId: pendingMatch.device_id,
          approverDevices: listed.devices,
          needsRecovery: true,
          errorMessage: "DEVICE_REBIND_REQUIRES_RECOVERY",
        };
      }
      try {
        const rebound = await requestExtensionKeyRebind(
          core,
          pendingMatch.device_id,
          fingerprint,
        );
        await writeDeviceId(rebound.device_id);
        await clearDeviceDeferred();
        return {
          status: "pending",
          deviceId: rebound.device_id,
          approverDevices: listed.devices,
        };
      } catch (error: unknown) {
        await writeDeviceId(pendingMatch.device_id);
        return {
          status: "pending",
          deviceId: pendingMatch.device_id,
          approverDevices: listed.devices,
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
    }
    try {
      await bindExtensionDeviceWithProof(core, pendingMatch.device_id);
      await writeDeviceId(pendingMatch.device_id);
      await clearDeviceDeferred();
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
      };
    } catch (error: unknown) {
      await writeDeviceId(pendingMatch.device_id);
      await clearDeviceDeferred();
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Dismissed on a trusted device — stay deferred until the user requests again.
  if (deferred) {
    return {
      status: "rejected",
      deviceId: deferred.deviceId,
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
      await clearExtensionDeviceSigningKey();
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

/** Explicit re-request after deferred / rejected — same as web retryDeviceRegistration. */
export async function retryExtensionDeviceRegistration(
  core: CoreApiClient,
): Promise<DeviceTrustSnapshot> {
  await clearDeviceDeferred();
  return resolveExtensionDeviceTrust(core, { forceRegister: true });
}

/**
 * Background / autofill trust probe: list devices and confirm this install is still
 * trusted. Does **not** auto-register (unlike `resolveExtensionDeviceTrust`).
 *
 * When the device was revoked in web, the account Bearer often still works (200),
 * so unlock session would otherwise keep serving autofill until the popup opens.
 * On untrusted / blocked → clear session storage (vaultKey, pending saves).
 *
 * @returns `trusted` | `untrusted` (session cleared) | `error` (transient; leave session)
 */
export async function probeExtensionDeviceTrusted(
  core: CoreApiClient,
): Promise<"trusted" | "untrusted" | "error"> {
  const fingerprint = await ensureFingerprint();
  let listed: {
    devices: DeviceListItemDto[];
    pending: DeviceListItemDto[];
    blocked?: DeviceListItemDto[];
  };
  try {
    listed = await core.listDevices(fingerprint);
  } catch (error: unknown) {
    if (isUnauthorizedApiError(error)) {
      throw error;
    }
    return "error";
  }

  const blockedMatch = (listed.blocked ?? []).find((device) =>
    fingerprintMatch(device, fingerprint),
  );
  if (blockedMatch) {
    const untilMs =
      blockedMatch.blocked_until == null ? null : new Date(blockedMatch.blocked_until).getTime();
    if (untilMs === null || untilMs > Date.now()) {
      await clearDeviceDeferred();
      await clearExtensionDeviceSigningKey();
      await clearExtensionSessionArea();
      return "untrusted";
    }
  }

  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  if (trustedMatch) {
    await writeDeviceId(trustedMatch.device_id);
    await clearDeviceDeferred();
    return "trusted";
  }

  // Revoked / pending / unknown — drop unlock material so autofill cannot continue.
  await clearExtensionSessionArea();
  return "untrusted";
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
      await clearDeviceDeferred();
      await clearExtensionDeviceSigningKey();
      await clearExtensionSessionArea();
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
    await clearDeviceDeferred();
    return {
      status: "trusted",
      deviceId: trustedMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  // Still not trusted while polling — keep session storage free of vaultKey.
  await clearExtensionSessionArea();

  const pendingMatch =
    listed.pending.find((device) => fingerprintMatch(device, fingerprint)) ??
    (pendingDeviceId
      ? listed.pending.find((device) => device.device_id === pendingDeviceId)
      : undefined);

  if (pendingMatch) {
    await clearDeviceDeferred();
    return {
      status: "pending",
      deviceId: pendingMatch.device_id,
      approverDevices: listed.devices,
    };
  }

  const deferred = await readDeviceDeferred();
  const rejectedId = pendingDeviceId ?? deferred?.deviceId ?? null;
  if (rejectedId && !deferred) {
    await writeDeviceDeferred(rejectedId);
  }
  if (rejectedId) {
    await clearExtensionDeviceSigningKey();
  }

  return {
    status: "rejected",
    deviceId: rejectedId,
    approverDevices: listed.devices,
  };
}
