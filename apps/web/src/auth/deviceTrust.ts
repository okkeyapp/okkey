import { ApiRequestError, type CoreApiClient } from "@okkey/api";
import { initCrypto, wipeBytes } from "@okkey/crypto";
import type { DeviceListItemDto, DeviceRegisterResponseDto } from "@okkey/types";

import { readStoredLocale } from "../locale/localeStorage";
import { bytesToBase64 } from "./base64";
import { parseBrowserEnvironment } from "./browserEnvironment";
import {
  clearDeviceSigningKey,
  ensureDeviceSigningPublicKey,
  hasDeviceSigningKey,
  rotateDeviceSigningKey,
  signDeviceBindChallenge,
} from "./deviceSigningKey";
import {
  getOrCreateDeviceFingerprint,
  isLegacyHexFingerprint,
} from "./deviceFingerprint";
import { readVaultBundle } from "./localVaultBundle";

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
  /** Trusted devices that can approve this pending device (for wait UI). */
  approverDevices: DeviceListItemDto[];
  errorMessage?: string;
  /** When status is blocked; null means permanently blocked. */
  blockedUntil?: string | null;
  /** Sole trusted device lost its seed — user must use account recovery. */
  needsRecovery?: boolean;
};

const PLACEHOLDER_SHARE_LEN = 32;

/** Device id whose bind-session proof succeeded for this tab session. */
let boundSessionDeviceId: string | null = null;

export function clearBoundDeviceSession(): void {
  boundSessionDeviceId = null;
}

function randomPlaceholderShare(): Uint8Array {
  const bytes = new Uint8Array(PLACEHOLDER_SHARE_LEN);
  crypto.getRandomValues(bytes);
  return bytes;
}

function fingerprintMatch(device: DeviceListItemDto, fingerprint: string): boolean {
  return device.device_fingerprint.trim().toLowerCase() === fingerprint.trim().toLowerCase();
}

async function bindDeviceWithProof(
  core: CoreApiClient,
  deviceId: string,
): Promise<void> {
  if (!(await hasDeviceSigningKey())) {
    throw new Error("device private key is missing");
  }
  await initCrypto();
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );
  const challenge = await core.createDeviceBindChallenge(deviceId);
  const message = Uint8Array.from(
    atob(challenge.challenge),
    (c) => c.charCodeAt(0),
  );
  const signature = await signDeviceBindChallenge(message);
  await core.bindDeviceSession(deviceId, {
    challenge_id: challenge.challenge_id,
    signature: bytesToBase64(signature),
    device_name: env.deviceName,
    platform: env.platform,
    os_name: env.osName,
    os_version: env.osVersion,
    app_version: "web",
    client_type: env.clientType,
    user_agent: env.userAgent,
  });
  boundSessionDeviceId = deviceId;
}

async function requestKeyRebindForLostSeed(
  core: CoreApiClient,
  deviceId: string,
  fingerprint: string,
): Promise<DeviceRegisterResponseDto> {
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );
  const publicKeyB64 = await rotateDeviceSigningKey();
  const shareBytes = randomPlaceholderShare();
  try {
    return await core.requestDeviceKeyRebind(deviceId, {
      device_public_key: publicKeyB64,
      device_share: bytesToBase64(shareBytes),
      device_fingerprint: fingerprint,
      device_name: env.deviceName,
      platform: env.platform,
      os_name: env.osName,
      os_version: env.osVersion,
      app_version: "web",
      client_type: env.clientType,
      user_agent: env.userAgent,
      locale: readStoredLocale(),
    });
  } finally {
    wipeBytes(shareBytes);
  }
}

/**
 * Reclaim is only for the registration browser that lost a legacy random hex fingerprint
 * but still holds the local vault bundle. Never rebind a different browser onto the sole
 * trusted device (that collapsed 4 browsers into 1 row).
 */
function canReclaimSoleTrustedDevice(
  sole: DeviceListItemDto,
  nextFingerprint: string,
  nextClientType: string,
): boolean {
  const oldFp = sole.device_fingerprint.trim().toLowerCase();
  const nextFp = nextFingerprint.trim().toLowerCase();
  if (oldFp === nextFp) {
    return false;
  }
  if (!isLegacyHexFingerprint(oldFp)) {
    // Structured id already identifies the browser — different fp ⇒ different device.
    return false;
  }
  const soleClient = (sole.client_type ?? "").trim().toLowerCase();
  if (
    soleClient &&
    soleClient !== "unknown" &&
    soleClient !== "web" &&
    soleClient !== nextClientType.trim().toLowerCase()
  ) {
    return false;
  }
  return true;
}

/**
 * Resolve whether the current browser is a trusted device; register as pending when new.
 *
 * Reclaims the sole trusted device only when migrating a legacy hex fingerprint on the
 * same browser that still has a local vault bundle.
 */
export async function resolveDeviceTrust(
  core: CoreApiClient,
  userId: string,
): Promise<DeviceTrustSnapshot> {
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );
  const fingerprint = getOrCreateDeviceFingerprint();
  const bundle = readVaultBundle(userId);
  const hasBundle = Boolean(bundle);

  let listed: {
    devices: DeviceListItemDto[];
    pending: DeviceListItemDto[];
    blocked?: DeviceListItemDto[];
  };
  try {
    listed = await core.listDevices(fingerprint);
  } catch (error: unknown) {
    // Dead Bearer (device revoked/blocked elsewhere) → caller must clear session.
    if (error instanceof ApiRequestError && error.status === 401) {
      throw error;
    }
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

  const blockedMatch = (listed.blocked ?? []).find((device) =>
    fingerprintMatch(device, fingerprint),
  );
  // Same browser fingerprint: active block wins over a leftover trusted row
  // (e.g. recovery stand-in blocked while an older trusted row still exists).
  if (blockedMatch) {
    const untilMs =
      blockedMatch.blocked_until == null
        ? null
        : new Date(blockedMatch.blocked_until).getTime();
    if (untilMs === null || untilMs > Date.now()) {
      await clearDeviceSigningKey();
      return {
        status: "blocked",
        deviceId: blockedMatch.device_id,
        approverDevices: listed.devices,
        blockedUntil: blockedMatch.blocked_until ?? null,
      };
    }
  }

  const trustedMatch = listed.devices.find((device) => fingerprintMatch(device, fingerprint));
  const pendingMatch = listed.pending.find((device) => fingerprintMatch(device, fingerprint));
  const soleTrusted = listed.devices.length === 1 ? listed.devices[0] : null;
  const canReclaimSole =
    hasBundle &&
    soleTrusted !== null &&
    canReclaimSoleTrustedDevice(soleTrusted, fingerprint, env.clientType);
  const canBootstrapTrusted = hasBundle && listed.devices.length === 0;
  const otherTrustedCount = listed.devices.filter(
    (device) => !trustedMatch || device.device_id !== trustedMatch.device_id,
  ).length;

  // Re-login on an already trusted or pending fingerprint binds the session
  // without minting new keys. Register would replace the trusted device share.
  if (trustedMatch && !canReclaimSole) {
    if (!(await hasDeviceSigningKey())) {
      // Pre-upgrade installs (and W1 bug) have no seed. Never silent-trust:
      // another device must approve a key rebind, or the user uses recovery.
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
        const rebound = await requestKeyRebindForLostSeed(
          core,
          trustedMatch.device_id,
          fingerprint,
        );
        const after = await core.listDevices(fingerprint).catch(() => listed);
        return {
          status: "pending",
          deviceId: rebound.device_id,
          approverDevices: after.devices,
        };
      } catch (error: unknown) {
        if (
          error instanceof ApiRequestError &&
          error.body.error === "DEVICE_REBIND_REQUIRES_RECOVERY"
        ) {
          return {
            status: "error",
            deviceId: trustedMatch.device_id,
            approverDevices: listed.devices,
            needsRecovery: true,
            errorMessage: "DEVICE_REBIND_REQUIRES_RECOVERY",
          };
        }
        return {
          status: "error",
          deviceId: trustedMatch.device_id,
          approverDevices: listed.devices,
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
    }
    try {
      await bindDeviceWithProof(core, trustedMatch.device_id);
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
  if (pendingMatch && !canReclaimSole && !canBootstrapTrusted) {
    if (!(await hasDeviceSigningKey())) {
      // Pending row without local seed: mint keys and request rebind when approvers exist.
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
        const rebound = await requestKeyRebindForLostSeed(
          core,
          pendingMatch.device_id,
          fingerprint,
        );
        return {
          status: "pending",
          deviceId: rebound.device_id,
          approverDevices: listed.devices,
        };
      } catch (error: unknown) {
        return {
          status: "pending",
          deviceId: pendingMatch.device_id,
          approverDevices: listed.devices,
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
    }
    try {
      await bindDeviceWithProof(core, pendingMatch.device_id);
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
      };
    } catch (error: unknown) {
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: listed.devices,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    const registered = await registerCurrentBrowserDevice(core, fingerprint, {
      userId,
      reclaimSoleTrusted: canReclaimSole,
    });
    if (registered.status === "trusted") {
      // POST /devices still binds the Bearer when it creates a trusted row.
      boundSessionDeviceId = registered.device_id;
      const after = await core.listDevices(fingerprint).catch(() => listed);
      return {
        status: "trusted",
        deviceId: registered.device_id,
        approverDevices: after.devices,
      };
    }

    if (registered.status === "blocked") {
      await clearDeviceSigningKey();
      return {
        status: "blocked",
        deviceId: registered.device_id,
        approverDevices: listed.devices,
        blockedUntil: registered.blocked_until ?? null,
      };
    }

    const afterPending = await core.listDevices(fingerprint).catch(() => listed);
    return {
      status: "pending",
      deviceId: registered.device_id,
      approverDevices: afterPending.devices,
    };
  } catch (error: unknown) {
    if (
      error instanceof ApiRequestError &&
      error.body.error === "DEVICE_FINGERPRINT_ALREADY_TRUSTED"
    ) {
      // Trusted fingerprint + new keys without a seed path — never overwrite; recover/rebind.
      const conflictId = trustedMatch?.device_id ?? pendingMatch?.device_id ?? null;
      if (conflictId && otherTrustedCount >= 1) {
        try {
          const rebound = await requestKeyRebindForLostSeed(core, conflictId, fingerprint);
          const after = await core.listDevices(fingerprint).catch(() => listed);
          return {
            status: "pending",
            deviceId: rebound.device_id,
            approverDevices: after.devices,
          };
        } catch {
          /* fall through */
        }
      }
      return {
        status: "error",
        deviceId: conflictId,
        approverDevices: listed.devices,
        needsRecovery: otherTrustedCount < 1,
        errorMessage: "DEVICE_FINGERPRINT_ALREADY_TRUSTED",
      };
    }
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

  if (pendingDeviceId) {
    const blockedById = (listed.blocked ?? []).find(
      (device) => device.device_id === pendingDeviceId,
    );
    if (blockedById) {
      const untilMs =
        blockedById.blocked_until == null
          ? null
          : new Date(blockedById.blocked_until).getTime();
      if (untilMs === null || untilMs > Date.now()) {
        await clearDeviceSigningKey();
        return {
          status: "blocked",
          deviceId: blockedById.device_id,
          approverDevices: listed.devices,
          blockedUntil: blockedById.blocked_until ?? null,
        };
      }
    }
  }

  const blockedMatch = (listed.blocked ?? []).find((device) =>
    fingerprintMatch(device, fingerprint),
  );
  if (blockedMatch) {
    const untilMs =
      blockedMatch.blocked_until == null
        ? null
        : new Date(blockedMatch.blocked_until).getTime();
    if (untilMs === null || untilMs > Date.now()) {
      await clearDeviceSigningKey();
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
    // Never report trusted for an unbound Bearer — that unlocked the vault UI while
    // /account/recovery and vault-unlock stayed 401 after a failed bind-session proof.
    if (boundSessionDeviceId === trustedMatch.device_id) {
      return {
        status: "trusted",
        deviceId: trustedMatch.device_id,
        approverDevices: listed.devices,
      };
    }
    if (!(await hasDeviceSigningKey())) {
      return {
        status: "error",
        deviceId: trustedMatch.device_id,
        approverDevices: listed.devices,
        needsRecovery: listed.devices.length <= 1,
        errorMessage: "DEVICE_REBIND_REQUIRES_RECOVERY",
      };
    }
    try {
      await bindDeviceWithProof(core, trustedMatch.device_id);
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
    await clearDeviceSigningKey();
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
  options?: {
    reclaimSoleTrusted?: boolean;
    claimAfterRecovery?: boolean;
    userId?: string;
  },
): Promise<DeviceRegisterResponseDto> {
  await initCrypto();
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );
  // Prefer structured identity from UA; argument is kept for callers/tests.
  const deviceFingerprint = fingerprint.trim() || env.fingerprint;
  const devicePublicKeyB64 = await ensureDeviceSigningPublicKey();

  const bundle = options?.userId ? readVaultBundle(options.userId) : null;
  let shareBytes: Uint8Array | null = null;
  let ownsShare = false;
  if (bundle?.device_share_b64) {
    try {
      const binary = atob(bundle.device_share_b64);
      shareBytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
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
      device_fingerprint: deviceFingerprint,
      device_name: env.deviceName,
      platform: env.platform,
      os_name: env.osName,
      os_version: env.osVersion,
      app_version: "web",
      client_type: env.clientType,
      user_agent: env.userAgent,
      // Explicit body locale: browsers ignore Accept-Language set via fetch.
      locale: readStoredLocale(),
      metadata: {
        crypto_capable: true,
        reclaim_sole_trusted: options?.reclaimSoleTrusted === true,
        claim_after_recovery: options?.claimAfterRecovery === true,
      },
    });
  } finally {
    if (ownsShare) {
      wipeBytes(shareBytes);
    }
  }
}
