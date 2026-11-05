/**
 * One-time key for extension device-approval share delivery.
 * Private keys stay in extension storage until the server accepts receipt.
 */
import { ApiRequestError, type CoreApiClient } from "@okkey/api";
import {
  generateOneTimeDeliveryKeyPair,
  initCrypto,
  openDeviceShareDelivery,
  wipeBytes,
  wipeOneTimeDeliveryPrivateKeys,
  type OneTimeDeliveryKeyPair,
} from "@okkey/crypto";

import {
  clearShareDeliveryKey,
  readShareDeliveryKey,
  readShareDeliveryReapproval,
  writeShareDeliveryKey,
  writeShareDeliveryReapproval,
} from "./storage.ts";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.trim());
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export type PreparedExtensionDeliveryKey = {
  x25519PublicB64: string;
  mlkemPublicB64: string;
};

export async function hasExtensionShareDeliveryKey(fingerprint: string): Promise<boolean> {
  const stored = await readShareDeliveryKey();
  return Boolean(stored && stored.fingerprint === fingerprint);
}

export async function extensionShareDeliveryReapproval(): Promise<boolean> {
  return readShareDeliveryReapproval();
}

export async function discardExtensionShareDeliveryKey(fingerprint?: string): Promise<void> {
  const stored = await readShareDeliveryKey();
  if (!stored) {
    return;
  }
  if (fingerprint && stored.fingerprint !== fingerprint) {
    return;
  }
  const x25519PrivateKey = base64ToBytes(stored.x25519PrivateB64);
  const mlkemPrivateKey = base64ToBytes(stored.mlkemPrivateB64);
  wipeOneTimeDeliveryPrivateKeys({ x25519PrivateKey, mlkemPrivateKey });
  await clearShareDeliveryKey();
}

export async function prepareExtensionShareDelivery(
  fingerprint: string,
  generate: () => Promise<OneTimeDeliveryKeyPair> = generateOneTimeDeliveryKeyPair,
  init: () => Promise<void> = initCrypto,
): Promise<PreparedExtensionDeliveryKey | null> {
  await init();
  const pair = await generate();
  try {
    await writeShareDeliveryKey({
      fingerprint,
      x25519PrivateB64: bytesToBase64(pair.x25519PrivateKey),
      mlkemPrivateB64: bytesToBase64(pair.mlkemPrivateKey),
    });
    return {
      x25519PublicB64: bytesToBase64(pair.x25519PublicKey),
      mlkemPublicB64: bytesToBase64(pair.mlkemPublicKey),
    };
  } finally {
    wipeOneTimeDeliveryPrivateKeys(pair);
  }
}

/**
 * Decrypt a waiting envelope and confirm receipt.
 * Returns `trusted` after the server deletes the envelope.
 */
export async function claimExtensionShareDelivery(
  core: CoreApiClient,
  fingerprint: string,
  deviceId: string,
  open: typeof openDeviceShareDelivery = openDeviceShareDelivery,
  init: () => Promise<void> = initCrypto,
): Promise<boolean> {
  const stored = await readShareDeliveryKey();
  if (!stored || stored.fingerprint !== fingerprint) {
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
  await init();
  const x25519PrivateKey = base64ToBytes(stored.x25519PrivateB64);
  const mlkemPrivateKey = base64ToBytes(stored.mlkemPrivateB64);
  let share: Uint8Array | null = null;
  try {
    share = await open({
      envelope: base64ToBytes(delivery.share_delivery_envelope),
      x25519PrivateKey,
      mlkemPrivateKey,
      deviceId,
    });
    await core.confirmDeviceShareDelivery(deviceId, bytesToBase64(share));
    await discardExtensionShareDeliveryKey(fingerprint);
    await writeShareDeliveryReapproval(false);
    return true;
  } finally {
    wipeBytes(x25519PrivateKey);
    wipeBytes(mlkemPrivateKey);
    if (share) {
      wipeBytes(share);
    }
  }
}

export async function markExtensionShareDeliveryReapproval(): Promise<void> {
  await writeShareDeliveryReapproval(true);
}
