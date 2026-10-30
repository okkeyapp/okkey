/**
 * Device signing key for bind-session proofs.
 *
 * Source of truth is a 32-byte Ed25519 seed in IndexedDB (not localStorage).
 * A non-extractable WebCrypto CryptoKey mirror is stored alongside when the
 * browser supports it; signing always verifies locally against the stored
 * public key before returning, and never silently mints a new key.
 */

import { ed25519Keypair, ed25519Sign, initCrypto, wipeBytes } from "@okkey/crypto";

import { DEVICE_PRIVATE_KEY_KEY, DEVICE_PUBLIC_KEY_KEY } from "./storageKeys";

const DB_NAME = "okkey.device.signing";
const DB_VERSION = 2;
const STORE = "keys";
const RECORD_ID = "current";

type StoredDeviceSigningKey = {
  id: typeof RECORD_ID;
  /** 32-byte Ed25519 seed — durable across reloads; cleared on revoke/block. */
  seed: ArrayBuffer;
  publicKeyB64: string;
  /** Optional non-extractable mirror for WebCrypto signing. */
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function copySeed(seed: ArrayBuffer): Uint8Array {
  return new Uint8Array(seed.slice(0));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function isValidRecord(row: unknown): row is StoredDeviceSigningKey {
  if (!row || typeof row !== "object") {
    return false;
  }
  const record = row as StoredDeviceSigningKey;
  return (
    record.id === RECORD_ID &&
    typeof record.publicKeyB64 === "string" &&
    record.publicKeyB64.length > 0 &&
    record.seed instanceof ArrayBuffer &&
    record.seed.byteLength === 32
  );
}

async function idbGet(): Promise<StoredDeviceSigningKey | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_ID);
      req.onsuccess = () => {
        const row = req.result;
        resolve(isValidRecord(row) ? row : null);
      };
      req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
    });
  } finally {
    db.close();
  }
}

async function idbPut(record: StoredDeviceSigningKey): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
    });
  } finally {
    db.close();
  }
}

async function idbClear(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB clear failed"));
    });
  } finally {
    db.close();
  }
}

function readLegacyLocalStorageSeed(): { secretB64: string; publicB64: string | null } | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const secretB64 = window.localStorage.getItem(DEVICE_PRIVATE_KEY_KEY);
    if (!secretB64?.trim()) {
      return null;
    }
    const publicB64 = window.localStorage.getItem(DEVICE_PUBLIC_KEY_KEY);
    return {
      secretB64: secretB64.trim(),
      publicB64: publicB64?.trim() || null,
    };
  } catch {
    return null;
  }
}

function clearLegacyLocalStorageKeys(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(DEVICE_PRIVATE_KEY_KEY);
    window.localStorage.removeItem(DEVICE_PUBLIC_KEY_KEY);
  } catch {
    /* ignore */
  }
}

async function importCryptoMirror(
  seed: Uint8Array,
  publicKeyBytes: Uint8Array,
): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey } | null> {
  try {
    const jwk: JsonWebKey = {
      kty: "OKP",
      crv: "Ed25519",
      d: base64UrlFromBytes(seed),
      x: base64UrlFromBytes(publicKeyBytes),
      ext: true,
      key_ops: ["sign"],
    };
    const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, [
      "sign",
    ]);
    const publicKey = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes as BufferSource,
      { name: "Ed25519" },
      true,
      ["verify"],
    );
    return { privateKey, publicKey };
  } catch {
    return null;
  }
}

async function persistRecord(
  seed: Uint8Array,
  publicKeyBytes: Uint8Array,
): Promise<StoredDeviceSigningKey> {
  const seedCopy = new Uint8Array(32);
  seedCopy.set(seed.subarray(0, 32));
  const mirror = await importCryptoMirror(seedCopy, publicKeyBytes);
  const record: StoredDeviceSigningKey = {
    id: RECORD_ID,
    seed: seedCopy.buffer,
    publicKeyB64: bytesToBase64(publicKeyBytes),
    privateKey: mirror?.privateKey,
    publicKey: mirror?.publicKey,
  };
  await idbPut(record);
  clearLegacyLocalStorageKeys();
  // Confirm durable read-back before callers register the public key.
  const stored = await idbGet();
  if (!stored || stored.publicKeyB64 !== record.publicKeyB64) {
    throw new Error("device signing key failed to persist");
  }
  return stored;
}

async function importFromLegacySeed(
  secretB64: string,
  publicB64: string,
): Promise<StoredDeviceSigningKey> {
  const secret = base64ToBytes(secretB64);
  const publicKeyBytes = base64ToBytes(publicB64);
  if (secret.length !== 32 || publicKeyBytes.length !== 32) {
    throw new Error("legacy device key lengths invalid");
  }
  try {
    return await persistRecord(secret, publicKeyBytes);
  } finally {
    wipeBytes(secret);
  }
}

async function generateAndStore(): Promise<StoredDeviceSigningKey> {
  await initCrypto();
  const pair = ed25519Keypair();
  try {
    const seed = pair.slice(0, 32);
    const publicKeyBytes = pair.slice(32, 64);
    return await persistRecord(seed, publicKeyBytes);
  } finally {
    wipeBytes(pair);
  }
}

async function loadExisting(): Promise<StoredDeviceSigningKey | null> {
  const existing = await idbGet();
  if (existing) {
    return existing;
  }
  const legacy = readLegacyLocalStorageSeed();
  if (legacy?.secretB64 && legacy.publicB64) {
    try {
      return await importFromLegacySeed(legacy.secretB64, legacy.publicB64);
    } catch {
      return null;
    }
  }
  return null;
}

async function loadOrCreate(): Promise<StoredDeviceSigningKey> {
  const existing = await loadExisting();
  if (existing) {
    return existing;
  }
  return generateAndStore();
}

/** True when a usable signing key is already stored (IndexedDB or migratable legacy). */
export async function hasDeviceSigningKey(): Promise<boolean> {
  try {
    if (await idbGet()) {
      return true;
    }
    const legacy = readLegacyLocalStorageSeed();
    return Boolean(legacy?.secretB64 && legacy.publicB64);
  } catch {
    return false;
  }
}

/** Ensure a device signing key exists; returns the raw public key (base64). */
export async function ensureDeviceSigningPublicKey(): Promise<string> {
  const record = await loadOrCreate();
  return record.publicKeyB64;
}

/** Read the public key without minting a new pair. */
export async function readDeviceSigningPublicKey(): Promise<string | null> {
  try {
    const existing = await loadExisting();
    return existing?.publicKeyB64 ?? null;
  } catch {
    return null;
  }
}

/**
 * Sign bind-challenge bytes. Never mints a new key — missing material throws so
 * callers cannot accidentally prove possession of a different key than registered.
 */
export async function signDeviceBindChallenge(message: Uint8Array): Promise<Uint8Array> {
  const record = await loadExisting();
  if (!record) {
    throw new Error("device private key is missing");
  }
  const publicKeyBytes = base64ToBytes(record.publicKeyB64);
  const msg = message.byteOffset === 0 && message.byteLength === message.buffer.byteLength
    ? message
    : message.slice();

  if (record.privateKey && record.publicKey) {
    try {
      const signature = new Uint8Array(
        await crypto.subtle.sign("Ed25519", record.privateKey, msg as BufferSource),
      );
      const ok = await crypto.subtle.verify(
        "Ed25519",
        record.publicKey,
        signature,
        msg as BufferSource,
      );
      if (ok) {
        return signature;
      }
    } catch {
      /* fall through to seed signing */
    }
  }

  await initCrypto();
  const seed = copySeed(record.seed);
  try {
    return ed25519Sign(seed, msg);
  } finally {
    wipeBytes(seed);
    wipeBytes(publicKeyBytes);
  }
}

/**
 * Replace the local signing key (e.g. before request-key-rebind). Returns new public key.
 */
export async function rotateDeviceSigningKey(): Promise<string> {
  await idbClear();
  clearLegacyLocalStorageKeys();
  const record = await generateAndStore();
  return record.publicKeyB64;
}

/** Drop the device signing key (revoke / block / intentional wipe). */
export async function clearDeviceSigningKey(): Promise<void> {
  try {
    await idbClear();
  } catch {
    /* ignore */
  }
  clearLegacyLocalStorageKeys();
}
