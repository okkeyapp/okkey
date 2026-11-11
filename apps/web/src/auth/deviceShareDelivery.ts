/**
 * One-time key for a single device-approval share delivery.
 * Private keys stay in localStorage until the server accepts receipt, then they are wiped.
 */
import { ApiRequestError, type CoreApiClient } from "@okkey/api";
import {
  generateOneTimeDeliveryKeyPair,
  initCrypto,
  openDeviceShareDelivery,
  openStoredSplitKeyShareB,
  sealDeviceShareForOneTimeKey,
  wipeBytes,
  wipeOneTimeDeliveryPrivateKeys,
} from "@okkey/crypto";

import { base64ToBytes, bytesToBase64 } from "./base64";
import { readVaultBundle } from "./localVaultBundle";
import { envelopeB64ForPlaintextShare, loadSplitKeyShareWrapKey } from "@okkey/vault";

const STORAGE_KEY = "okkey.device.share_delivery_keypair";
const REAPPROVAL_KEY = "okkey.device.share_delivery_reapproval";

interface StoredOneTimeDeliveryKey {
  fingerprint: string;
  x25519PrivateB64: string;
  mlkemPrivateB64: string;
}

export interface PreparedOneTimeDeliveryKey {
  x25519PublicB64: string;
  mlkemPublicB64: string;
}

function readStored(): StoredOneTimeDeliveryKey | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredOneTimeDeliveryKey>;
    if (
      typeof parsed.fingerprint !== "string" ||
      typeof parsed.x25519PrivateB64 !== "string" ||
      typeof parsed.mlkemPrivateB64 !== "string"
    ) {
      return null;
    }
    return {
      fingerprint: parsed.fingerprint,
      x25519PrivateB64: parsed.x25519PrivateB64,
      mlkemPrivateB64: parsed.mlkemPrivateB64,
    };
  } catch {
    return null;
  }
}

export function hasOneTimeShareDelivery(fingerprint: string): boolean {
  const stored = readStored();
  return Boolean(stored && stored.fingerprint === fingerprint);
}

export function markShareDeliveryReapproval(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(REAPPROVAL_KEY, "1");
}

export function clearShareDeliveryReapproval(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(REAPPROVAL_KEY);
}

export function needsShareDeliveryReapproval(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  return localStorage.getItem(REAPPROVAL_KEY) === "1";
}

/** Delete the one-time private key. Safe to call when nothing is stored. */
export function discardOneTimeShareDelivery(fingerprint?: string): void {
  const stored = readStored();
  if (!stored) {
    return;
  }
  if (fingerprint && stored.fingerprint !== fingerprint) {
    return;
  }
  const x25519PrivateKey = base64ToBytes(stored.x25519PrivateB64);
  const mlkemPrivateKey = base64ToBytes(stored.mlkemPrivateB64);
  wipeOneTimeDeliveryPrivateKeys({ x25519PrivateKey, mlkemPrivateKey });
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Seal this browser's share B when the pending device published a one-time key. */
export async function sealLocalShareForPendingDevice(input: {
  userId: string;
  deviceId: string;
  oneTimeX25519PublicKey?: string;
  oneTimeMlkemPublicKey?: string;
}): Promise<string | null> {
  const x25519 = input.oneTimeX25519PublicKey?.trim() ?? "";
  const mlkem = input.oneTimeMlkemPublicKey?.trim() ?? "";
  if (!x25519 || !mlkem) {
    return null;
  }
  const shareB64 = readVaultBundle(input.userId)?.device_share_b64?.trim() ?? "";
  if (!shareB64) {
    return null;
  }
  await initCrypto();
  const stored = base64ToBytes(shareB64);
  const keys = await loadSplitKeyShareWrapKey(input.userId);
  const share = await openStoredSplitKeyShareB({
    stored,
    recipientEd25519Seed: keys?.ed25519Seed,
    recipientMlkemDecapsulationKey: keys?.mlkemDecapsulationKey,
  });
  try {
    const envelope = await sealDeviceShareForOneTimeKey({
      deviceShare: share,
      recipientX25519PublicKey: base64ToBytes(x25519),
      recipientMlkemPublicKey: base64ToBytes(mlkem),
      deviceId: input.deviceId,
    });
    return bytesToBase64(envelope);
  } finally {
    wipeBytes(stored);
    wipeBytes(share);
  }
}

export async function prepareOneTimeShareDelivery(
  fingerprint: string,
): Promise<PreparedOneTimeDeliveryKey> {
  await initCrypto();
  const pair = await generateOneTimeDeliveryKeyPair();
  try {
    const stored: StoredOneTimeDeliveryKey = {
      fingerprint,
      x25519PrivateB64: bytesToBase64(pair.x25519PrivateKey),
      mlkemPrivateB64: bytesToBase64(pair.mlkemPrivateKey),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return {
      x25519PublicB64: bytesToBase64(pair.x25519PublicKey),
      mlkemPublicB64: bytesToBase64(pair.mlkemPublicKey),
    };
  } finally {
    wipeOneTimeDeliveryPrivateKeys(pair);
  }
}

/**
 * If an envelope is waiting, decrypt it, confirm receipt, and delete the one-time private key.
 * Returns true when the device is now trusted.
 */
export async function acceptShareDeliveryIfPresent(
  core: CoreApiClient,
  fingerprint: string,
  deviceId: string,
  userId: string,
): Promise<boolean> {
  const stored = readStored();
  if (!stored || stored.fingerprint !== fingerprint) {
    return false;
  }
  if (typeof core.getDeviceShareDelivery !== "function" || typeof core.confirmDeviceShareDelivery !== "function") {
    return false;
  }
  let delivery: { share_delivery_envelope: string };
  try {
    delivery = await core.getDeviceShareDelivery(deviceId);
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 410)) {
      return false;
    }
    throw error;
  }
  await initCrypto();
  const x25519PrivateKey = base64ToBytes(stored.x25519PrivateB64);
  const mlkemPrivateKey = base64ToBytes(stored.mlkemPrivateB64);
  let share: Uint8Array | null = null;
  try {
    share = await openDeviceShareDelivery({
      envelope: base64ToBytes(delivery.share_delivery_envelope),
      x25519PrivateKey,
      mlkemPrivateKey,
      deviceId,
    });
    const wireB64 = await envelopeB64ForPlaintextShare({ userId, share });
    await core.confirmDeviceShareDelivery(deviceId, wireB64);
    discardOneTimeShareDelivery(fingerprint);
    clearShareDeliveryReapproval();
    return true;
  } finally {
    wipeBytes(x25519PrivateKey);
    wipeBytes(mlkemPrivateKey);
    if (share) {
      wipeBytes(share);
    }
  }
}
