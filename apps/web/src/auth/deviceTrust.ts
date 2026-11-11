import { ApiRequestError, type CoreApiClient } from "@okkey/api";
import { deviceBindShareProof, initCrypto, wipeBytes } from "@okkey/crypto";
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
import {
  acceptShareDeliveryIfPresent,
  clearShareDeliveryReapproval,
  discardOneTimeShareDelivery,
  hasOneTimeShareDelivery,
  markShareDeliveryReapproval,
  needsShareDeliveryReapproval,
  prepareOneTimeShareDelivery,
} from "./deviceShareDelivery";
import { readVaultBundle, writeVaultBundle } from "./localVaultBundle";
import { deviceShareB64ForRegister } from "./deviceShareWire";

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
  /** Pending device lost its one-time key and must be approved again. */
  needsShareReapproval?: boolean;
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
  const stored = device.device_fingerprint;
  if (typeof stored !== "string" || stored.trim().length === 0) {
    return false;
  }
  return stored.trim().toLowerCase() === fingerprint.trim().toLowerCase();
}

/** Wire status for a device that still needs approval. */
function isPendingApproval(device: { status?: string }): boolean {
  return device.status === "pending_approval" || device.status === "pending";
}

/**
 * Rows in `devices` are trusted approvers. A pending sign-in must not be treated
 * as trusted just because it was returned in that array.
 */
function isTrustedRow(device: { status?: string }): boolean {
  return device.status == null || device.status === "trusted";
}

function sameListedDeviceId(left: unknown, right: unknown): boolean {
  if (left == null || right == null) {
    return false;
  }
  const a = String(left).trim();
  const b = String(right).trim();
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) {
    return false;
  }
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

function pendingRows(listed: {
  devices?: DeviceListItemDto[];
  pending?: DeviceListItemDto[];
}): DeviceListItemDto[] {
  return [
    ...(listed.pending ?? []),
    ...(listed.devices ?? []).filter((device) => isPendingApproval(device)),
  ];
}

function findPendingRow(
  listed: { devices?: DeviceListItemDto[]; pending?: DeviceListItemDto[] },
  fingerprint: string,
  pendingDeviceId?: string | null,
): DeviceListItemDto | undefined {
  const rows = pendingRows(listed);
  const byFingerprint = rows.find((device) => fingerprintMatch(device, fingerprint));
  if (byFingerprint) {
    return byFingerprint;
  }
  if (pendingDeviceId == null || String(pendingDeviceId).trim().length === 0) {
    return undefined;
  }
  return rows.find((device) => sameListedDeviceId(device.device_id, pendingDeviceId));
}

function findTrustedRow(
  devices: DeviceListItemDto[] | undefined,
  fingerprint: string,
): DeviceListItemDto | undefined {
  return (devices ?? []).find(
    (device) => isTrustedRow(device) && fingerprintMatch(device, fingerprint),
  );
}

function trustedApprovers(devices: DeviceListItemDto[] | undefined): DeviceListItemDto[] {
  return (devices ?? []).filter((device) => isTrustedRow(device));
}

function browserBindMetadata() {
  const env = parseBrowserEnvironment(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );
  return {
    device_name: env.deviceName,
    platform: env.platform,
    os_name: env.osName,
    os_version: env.osVersion,
    app_version: "web",
    client_type: env.clientType,
    user_agent: env.userAgent,
  };
}

/**
 * Same browser, seed never stored: prove the vault device share and install a
 * signing key. Does not call register, so a trusted fingerprint cannot 409.
 */
async function bindDeviceWithShareProof(
  core: CoreApiClient,
  deviceId: string,
  shareB64: string,
): Promise<void> {
  await initCrypto();
  const publicKeyB64 = await rotateDeviceSigningKey();
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
      ...browserBindMetadata(),
    });
    boundSessionDeviceId = deviceId;
  } catch (error) {
    await clearDeviceSigningKey();
    throw error;
  }
}

async function bindDeviceWithProof(
  core: CoreApiClient,
  deviceId: string,
): Promise<void> {
  if (!(await hasDeviceSigningKey())) {
    throw new Error("device private key is missing");
  }
  await initCrypto();
  const challenge = await core.createDeviceBindChallenge(deviceId);
  const message = Uint8Array.from(
    atob(challenge.challenge),
    (c) => c.charCodeAt(0),
  );
  const signature = await signDeviceBindChallenge(message);
  await core.bindDeviceSession(deviceId, {
    challenge_id: challenge.challenge_id,
    signature: bytesToBase64(signature),
    ...browserBindMetadata(),
  });
  boundSessionDeviceId = deviceId;
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

  const trustedMatch = findTrustedRow(listed.devices, fingerprint);
  const pendingMatch = findPendingRow(listed, fingerprint);
  const soleTrusted = listed.devices.length === 1 ? listed.devices[0] : null;
  const canReclaimSole =
    hasBundle &&
    soleTrusted !== null &&
    canReclaimSoleTrustedDevice(soleTrusted, fingerprint, env.clientType);
  const canBootstrapTrusted = hasBundle && listed.devices.length === 0;

  // Re-login on an already trusted or pending fingerprint binds the session
  // without minting new keys. Register would replace the trusted device share.
  if (trustedMatch && !canReclaimSole) {
    if (!(await hasDeviceSigningKey())) {
      const shareB64 = bundle?.device_share_b64?.trim() ?? "";
      if (shareB64) {
        try {
          await bindDeviceWithShareProof(core, trustedMatch.device_id, shareB64);
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
      // No signing key and no vault share: do not demote another device.
      return {
        status: "error",
        deviceId: trustedMatch.device_id,
        approverDevices: listed.devices,
        needsRecovery: true,
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
  if (pendingMatch && !canReclaimSole && !canBootstrapTrusted) {
    if (
      await rotateLostShareDeliveryKey(core, fingerprint, pendingMatch, userId)
    ) {
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: trustedApprovers(listed.devices),
        needsShareReapproval: true,
      };
    }
    if (!(await hasDeviceSigningKey())) {
      const shareB64 = bundle?.device_share_b64?.trim() ?? "";
      if (shareB64) {
        try {
          await bindDeviceWithShareProof(core, pendingMatch.device_id, shareB64);
          return {
            status: "pending",
            deviceId: pendingMatch.device_id,
            approverDevices: trustedApprovers(listed.devices),
          };
        } catch (error: unknown) {
          return {
            status: "pending",
            deviceId: pendingMatch.device_id,
            approverDevices: trustedApprovers(listed.devices),
            errorMessage: error instanceof Error ? error.message : String(error),
          };
        }
      }
      // Empty `devices` is not "no approvers": a session that is not trusted
      // only receives its own row, so the waiting device must stay pending.
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: trustedApprovers(listed.devices),
      };
    }
    try {
      await bindDeviceWithProof(core, pendingMatch.device_id);
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: trustedApprovers(listed.devices),
      };
    } catch (error: unknown) {
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: trustedApprovers(listed.devices),
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
      approverDevices: trustedApprovers(afterPending.devices),
    };
  } catch (error: unknown) {
    if (
      error instanceof ApiRequestError &&
      error.body.error === "DEVICE_FINGERPRINT_ALREADY_TRUSTED"
    ) {
      const conflictId = trustedMatch?.device_id ?? pendingMatch?.device_id ?? null;
      return {
        status: "error",
        deviceId: conflictId,
        approverDevices: listed.devices,
        needsRecovery: true,
        errorMessage: "DEVICE_FINGERPRINT_ALREADY_TRUSTED",
      };
    }
    if (pendingMatch) {
      return {
        status: "pending",
        deviceId: pendingMatch.device_id,
        approverDevices: trustedApprovers(listed.devices),
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
/**
 * Pending device published a one-time key, but this browser no longer has the
 * private half. Publish a new pair and drop any stored envelope so approval
 * can be requested again.
 */
async function rotateLostShareDeliveryKey(
  core: CoreApiClient,
  fingerprint: string,
  pending: DeviceListItemDto,
  userId?: string,
): Promise<boolean> {
  if (!pending.one_time_x25519_public_key || !pending.one_time_mlkem_public_key) {
    return false;
  }
  if (hasOneTimeShareDelivery(fingerprint)) {
    return false;
  }
  try {
    await registerCurrentBrowserDevice(core, fingerprint, { userId });
    markShareDeliveryReapproval();
    return true;
  } catch {
    discardOneTimeShareDelivery(fingerprint);
    return false;
  }
}

export async function pollDeviceTrust(
  core: CoreApiClient,
  fingerprint: string,
  pendingDeviceId: string | null,
  userId?: string,
): Promise<DeviceTrustSnapshot> {
  let listed = await core.listDevices(fingerprint);

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

  const pendingBeforeTrust = findPendingRow(listed, fingerprint, pendingDeviceId);
  if (pendingBeforeTrust) {
    const rotated = await rotateLostShareDeliveryKey(
      core,
      fingerprint,
      pendingBeforeTrust,
      userId,
    );
    if (rotated) {
      return {
        status: "pending",
        deviceId: pendingBeforeTrust.device_id,
        approverDevices: trustedApprovers(listed.devices),
        needsShareReapproval: true,
      };
    }
    const accepted = await acceptShareDeliveryIfPresent(
      core,
      fingerprint,
      pendingBeforeTrust.device_id,
      userId ?? "",
    ).catch(() => false);
    if (accepted) {
      listed = await core.listDevices(fingerprint);
    }
  }

  const trustedMatch = findTrustedRow(listed.devices, fingerprint);
  if (trustedMatch) {
    discardOneTimeShareDelivery(fingerprint);
    clearShareDeliveryReapproval();
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
      const shareB64 =
        (userId ? readVaultBundle(userId)?.device_share_b64?.trim() : "") ?? "";
      if (shareB64) {
        try {
          await bindDeviceWithShareProof(core, trustedMatch.device_id, shareB64);
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

  const pendingMatch = findPendingRow(listed, fingerprint, pendingDeviceId);

  if (pendingMatch) {
    return {
      status: "pending",
      deviceId: pendingMatch.device_id,
      approverDevices: trustedApprovers(listed.devices),
      needsShareReapproval: needsShareDeliveryReapproval(),
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
    /** Bind a pending sibling before recovery-key proof. Not a trusted-device claim. */
    recoveryPending?: boolean;
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
  const oneTime = await prepareOneTimeShareDelivery(deviceFingerprint).catch(() => null);

  const bundle = options?.userId ? readVaultBundle(options.userId) : null;
  const userId = options?.userId?.trim() ?? "";
  let shareB64: string;
  if (!userId) {
    const placeholder = randomPlaceholderShare();
    shareB64 = bytesToBase64(placeholder);
    wipeBytes(placeholder);
  } else {
    const wire = await deviceShareB64ForRegister({
      userId,
      existingShareB64: bundle?.device_share_b64 ?? null,
    });
    shareB64 = wire.shareB64;
    if (wire.upgradedShareB64 && bundle) {
      writeVaultBundle({ ...bundle, device_share_b64: wire.upgradedShareB64 }, userId);
    }
  }

  const registered = await core.registerDevice({
    device_public_key: devicePublicKeyB64,
    device_share: shareB64,
    device_fingerprint: deviceFingerprint,
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
    app_version: "web",
    client_type: env.clientType,
    user_agent: env.userAgent,
    locale: readStoredLocale(),
    metadata: {
      crypto_capable: true,
      reclaim_sole_trusted: options?.reclaimSoleTrusted === true,
      claim_after_recovery: options?.claimAfterRecovery === true,
      recovery_pending: options?.recoveryPending === true,
    },
  });
  if (registered.status === "trusted") {
    discardOneTimeShareDelivery(deviceFingerprint);
  }
  return registered;
}
