/**
 * One-time key for extension device-approval share delivery.
 * Private keys stay in extension storage until the server accepts receipt.
 */
import type { CoreApiClient } from "@okkey/api";

async function envelopeB64ForPlaintextShare(userId: string, share: Uint8Array): Promise<string> {
  const { envelopeB64ForPlaintextShare: encode } = await import("@okkey/vault/device-share-wire");
  return encode({ userId, share });
}
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

/** Duck-typed so extension unit tests can load this file without `@okkey/api` dist. */
function isMissingShareDeliveryError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const candidate = err as { name?: unknown; status?: unknown };
  return (
    candidate.name === "ApiRequestError" &&
    (candidate.status === 404 || candidate.status === 410)
  );
}

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
  userId = "",
  encodeShare?: (share: Uint8Array, userId: string) => Promise<string>,
): Promise<boolean> {
  const stored = await readShareDeliveryKey();
  if (!stored || stored.fingerprint !== fingerprint) {
    return false;
  }
  let delivery: { share_delivery_envelope: string };
  try {
    delivery = await core.getDeviceShareDelivery(deviceId);
  } catch (error: unknown) {
    if (isMissingShareDeliveryError(error)) {
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
    const wireB64 = encodeShare
      ? await encodeShare(share, userId)
      : await envelopeB64ForPlaintextShare(userId, share);
    await core.confirmDeviceShareDelivery(deviceId, wireB64);
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
