import type { CoreApiClient } from "@okkey/api";
import { deviceBindShareProof, initCrypto, wipeBytes } from "@okkey/crypto";
import { deviceShareB64ForRegister } from "@okkey/vault/device-share-wire";
import type { DeviceListItemDto, DeviceRegisterResponseDto } from "@okkey/types";

import { isUnauthorizedApiError } from "./apiErrors.ts";
import { parseBrowserEnvironment } from "./browserEnvironment.ts";
import {
  claimExtensionShareDelivery,
  discardExtensionShareDeliveryKey,
  extensionShareDeliveryReapproval,
  hasExtensionShareDeliveryKey,
  markExtensionShareDeliveryReapproval,
  prepareExtensionShareDelivery,
} from "./deviceShareDelivery.ts";
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
  readSession,
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
  /** Pending install lost its one-time key and must be approved again. */
  needsShareReapproval?: boolean;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function bindExtensionDeviceWithShareProof(
  core: CoreApiClient,
  deviceId: string,
  shareB64: string,
): Promise<void> {
  await initCrypto();
  const publicKeyB64 = await rotateExtensionDeviceSigningKey();
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    { channel: "Extension" },
  );
  try {
    const challenge = await core.createDeviceBindChallenge(deviceId);
    const message = Uint8Array.from(atob(challenge.challenge), (c) => c.charCodeAt(0));
    const share = Uint8Array.from(atob(shareB64), (c) => c.charCodeAt(0));
    const proof = deviceBindShareProof(share, message);
    wipeBytes(share);
    await core.bindDeviceSession(deviceId, {
      challenge_id: challenge.challenge_id,
      share_proof: bytesToBase64(proof),
      new_device_public_key: publicKeyB64,
      device_name: env.deviceName,
      platform: env.platform,
      os_name: env.osName,
      os_version: env.osVersion,
      app_version: "extension",
      client_type: env.clientType,
      user_agent: env.userAgent,
    });
  } catch (error) {
    await clearExtensionDeviceSigningKey();
    throw error;
  }
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
  options?: {
    userId?: string;
    existingShareB64?: string;
    prepareShareDelivery?: (
      fingerprint: string,
    ) => Promise<{ x25519PublicB64: string; mlkemPublicB64: string } | null>;
    initCrypto?: () => Promise<void>;
    signingPublicKey?: () => Promise<string>;
  },
): Promise<DeviceRegisterResponseDto> {
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    { channel: "Extension" },
  );
  const fingerprint = await ensureFingerprint();
  await (options?.initCrypto ?? initCrypto)();
  const devicePublicKeyB64 = options?.signingPublicKey
    ? await options.signingPublicKey()
    : await ensureExtensionDeviceSigningPublicKey();

  const locale = await loadExtensionLocale();
  const prepare = options?.prepareShareDelivery ?? prepareExtensionShareDelivery;
  const oneTime = await prepare(fingerprint).catch(() => null);
  const wire = options?.userId?.trim()
    ? await deviceShareB64ForRegister({
        userId: options.userId.trim(),
        existingShareB64: options.existingShareB64,
      })
    : null;
  const result = await core.registerDevice({
    device_public_key: devicePublicKeyB64,
    device_share: wire?.shareB64 ?? randomDeviceShareB64(),
    device_fingerprint: fingerprint,
    ...(oneTime
      ? {
          one_time_x25519_public_key: oneTime.x25519PublicB64,
          one_time_mlkem_public_key: oneTime.mlkemPublicB64,
        }
      : {}),
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
  if (result.status === "trusted") {
    await discardExtensionShareDeliveryKey(fingerprint);
  }
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
  options?: { forceRegister?: boolean; deviceShareB64?: string; userId?: string },
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

  if (trustedMatch) {
    await discardExtensionShareDeliveryKey(fingerprint);
    if (!(await hasExtensionDeviceSigningKey())) {
      const shareB64 = options?.deviceShareB64?.trim() ?? "";
      if (shareB64) {
        try {
          await bindExtensionDeviceWithShareProof(core, trustedMatch.device_id, shareB64);
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
      return {
        status: "error",
        deviceId: trustedMatch.device_id,
        approverDevices: listed.devices,
        needsRecovery: true,
        errorMessage: "DEVICE_REBIND_REQUIRES_RECOVERY",
      };
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
    const rotated = await rotateLostExtensionShareDeliveryKey(core, fingerprint, pendingMatch);
    if (rotated) {
      await writeDeviceId(pendingMatch.device_id);
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
        needsShareReapproval: true,
      };
    }
    if (
      await claimExtensionShareDelivery(
        core,
        fingerprint,
        pendingMatch.device_id,
        undefined,
        undefined,
        options?.userId ?? "",
      ).catch(() => false)
    ) {
      return {
        status: "trusted",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
      };
    }
    const needsShareReapproval = await extensionShareDeliveryReapproval();
    if (!(await hasExtensionDeviceSigningKey())) {
      const shareB64 = options?.deviceShareB64?.trim() ?? "";
      if (shareB64) {
        try {
          await bindExtensionDeviceWithShareProof(core, pendingMatch.device_id, shareB64);
          await writeDeviceId(pendingMatch.device_id);
          await clearDeviceDeferred();
          return {
            status: "pending",
            deviceId: pendingMatch.device_id,
            approverDevices: listed.devices,
            needsShareReapproval,
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
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
        needsRecovery: listed.devices.length < 1,
        errorMessage: listed.devices.length < 1 ? "DEVICE_REBIND_REQUIRES_RECOVERY" : undefined,
      };
    }
    try {
      await bindExtensionDeviceWithProof(core, pendingMatch.device_id);
      await writeDeviceId(pendingMatch.device_id);
      await clearDeviceDeferred();
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
        needsShareReapproval,
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
    const registered = await registerExtensionDevice(core, {
      userId: options?.userId,
      existingShareB64: options?.deviceShareB64,
    });
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
  deviceShareB64?: string,
  userId?: string,
): Promise<DeviceTrustSnapshot> {
  await clearDeviceDeferred();
  return resolveExtensionDeviceTrust(core, { forceRegister: true, deviceShareB64, userId });
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

async function rotateLostExtensionShareDeliveryKey(
  core: CoreApiClient,
  fingerprint: string,
  pending: DeviceListItemDto,
): Promise<boolean> {
  if (!pending.one_time_x25519_public_key || !pending.one_time_mlkem_public_key) {
    return false;
  }
  if (await hasExtensionShareDeliveryKey(fingerprint)) {
    return false;
  }
  try {
    await registerExtensionDevice(core);
    await markExtensionShareDeliveryReapproval();
    return true;
  } catch {
    await discardExtensionShareDeliveryKey(fingerprint);
    return false;
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

  const pendingForDelivery =
    listed.pending.find((device) => fingerprintMatch(device, fingerprint)) ??
    (pendingDeviceId
      ? listed.pending.find((device) => device.device_id === pendingDeviceId)
      : undefined);
  if (pendingForDelivery) {
    const rotated = await rotateLostExtensionShareDeliveryKey(
      core,
      fingerprint,
      pendingForDelivery,
    );
    if (rotated) {
      await clearExtensionSessionArea();
      return {
        status: "pending",
        deviceId: pendingForDelivery.device_id,
        approverDevices: listed.devices,
        needsShareReapproval: true,
      };
    }
    const session = await readSession();
    if (
      await claimExtensionShareDelivery(
        core,
        fingerprint,
        pendingForDelivery.device_id,
        undefined,
        undefined,
        session?.user_id ?? "",
      ).catch(() => false)
    ) {
      const refreshed = await core.listDevices(fingerprint);
      const trustedAfter = refreshed.devices.find((device) =>
        fingerprintMatch(device, fingerprint),
      );
      if (trustedAfter) {
        await writeDeviceId(trustedAfter.device_id);
        await clearDeviceDeferred();
        return {
          status: "trusted",
          deviceId: trustedAfter.device_id,
          approverDevices: refreshed.devices,
        };
      }
    }
  }

  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  if (trustedMatch) {
    await discardExtensionShareDeliveryKey(fingerprint);
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
      needsShareReapproval: await extensionShareDeliveryReapproval(),
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
