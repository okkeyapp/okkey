/**
 * Device signing key for bind-session proofs.
 *
 * Private key is a non-extractable Ed25519 CryptoKey in IndexedDB (not
 * localStorage). Legacy base64 seeds in localStorage are migrated once.
 */

import { DEVICE_PRIVATE_KEY_KEY, DEVICE_PUBLIC_KEY_KEY } from "./storageKeys";

const DB_NAME = "okkey.device.signing";
const DB_VERSION = 1;
const STORE = "keys";
const RECORD_ID = "current";

type StoredDeviceSigningKey = {
  id: typeof RECORD_ID;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyB64: string;
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
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

async function idbGet(): Promise<StoredDeviceSigningKey | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_ID);
      req.onsuccess = () => {
        const row = req.result as StoredDeviceSigningKey | undefined;
        resolve(row?.privateKey && row.publicKey && row.publicKeyB64 ? row : null);
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

async function importFromLegacySeed(
  secretB64: string,
  publicB64: string | null,
): Promise<StoredDeviceSigningKey> {
  const secret = base64ToBytes(secretB64);
  if (secret.length !== 32) {
    throw new Error("legacy device seed must be 32 bytes");
  }
  let publicKeyBytes: Uint8Array;
  if (publicB64) {
    publicKeyBytes = base64ToBytes(publicB64);
  } else {
    // Derive verifying key via a temporary extractable import + generate is not available;
    // require the stored public key for migration.
    throw new Error("legacy device public key missing");
  }
  if (publicKeyBytes.length !== 32) {
    throw new Error("legacy device public key must be 32 bytes");
  }
  const jwk: JsonWebKey = {
    kty: "OKP",
    crv: "Ed25519",
    d: base64UrlFromBytes(secret),
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
  const record: StoredDeviceSigningKey = {
    id: RECORD_ID,
    privateKey,
    publicKey,
    publicKeyB64: bytesToBase64(publicKeyBytes),
  };
  await idbPut(record);
  clearLegacyLocalStorageKeys();
  return record;
}

async function generateAndStore(): Promise<StoredDeviceSigningKey> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const record: StoredDeviceSigningKey = {
    id: RECORD_ID,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyB64: bytesToBase64(rawPub),
  };
  await idbPut(record);
  clearLegacyLocalStorageKeys();
  return record;
}

async function loadOrCreate(): Promise<StoredDeviceSigningKey> {
  const existing = await idbGet();
  if (existing) {
    return existing;
  }
  const legacy = readLegacyLocalStorageSeed();
  if (legacy?.publicB64) {
    try {
      return await importFromLegacySeed(legacy.secretB64, legacy.publicB64);
    } catch {
      /* fall through to mint a new pair */
    }
  }
  return generateAndStore();
}

/** True when a usable signing key is already stored (IndexedDB or migratable legacy). */
export async function hasDeviceSigningKey(): Promise<boolean> {
  try {
    const existing = await idbGet();
    if (existing) {
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
    const existing = await idbGet();
    if (existing) {
      return existing.publicKeyB64;
    }
    const legacy = readLegacyLocalStorageSeed();
    return legacy?.publicB64 ?? null;
  } catch {
    return null;
  }
}

/** Sign bind-challenge bytes with the non-extractable device key. */
export async function signDeviceBindChallenge(message: Uint8Array): Promise<Uint8Array> {
  const record = await loadOrCreate();
  const signature = await crypto.subtle.sign(
    "Ed25519",
    record.privateKey,
    message as BufferSource,
  );
  return new Uint8Array(signature);
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
