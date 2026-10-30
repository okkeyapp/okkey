/**
 * Extension device signing key for bind-session proofs.
 * Private key is a non-extractable Ed25519 CryptoKey in IndexedDB.
 * Legacy base64 seeds in chrome.storage.local are migrated once.
 */

import {
  STORAGE_KEYS,
} from "./storage.ts";

const DB_NAME = "okkey.extension.device.signing";
const DB_VERSION = 1;
const STORE = "keys";
const RECORD_ID = "current";

type StoredDeviceSigningKey = {
  id: typeof RECORD_ID;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyB64: string;
};

function storageArea(): typeof browser.storage.local {
  return browser.storage.local;
}

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
  try {
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
  } catch {
    /* ignore */
  }
}

async function readLegacySeed(): Promise<{ secretB64: string; publicB64: string | null } | null> {
  try {
    const result = await storageArea().get([
      STORAGE_KEYS.devicePrivateKey,
      STORAGE_KEYS.devicePublicKey,
    ]);
    const secretB64 = result[STORAGE_KEYS.devicePrivateKey];
    if (typeof secretB64 !== "string" || !secretB64.trim()) {
      return null;
    }
    const publicB64 = result[STORAGE_KEYS.devicePublicKey];
    return {
      secretB64: secretB64.trim(),
      publicB64: typeof publicB64 === "string" && publicB64.trim() ? publicB64.trim() : null,
    };
  } catch {
    return null;
  }
}

async function clearLegacySeed(): Promise<void> {
  try {
    await storageArea().remove([STORAGE_KEYS.devicePrivateKey, STORAGE_KEYS.devicePublicKey]);
  } catch {
    /* ignore */
  }
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
  await clearLegacySeed();
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
  await clearLegacySeed();
  return record;
}

async function loadOrCreate(): Promise<StoredDeviceSigningKey> {
  const existing = await idbGet();
  if (existing) {
    return existing;
  }
  const legacy = await readLegacySeed();
  if (legacy?.publicB64) {
    try {
      return await importFromLegacySeed(legacy.secretB64, legacy.publicB64);
    } catch {
      /* mint new */
    }
  }
  return generateAndStore();
}

export async function hasExtensionDeviceSigningKey(): Promise<boolean> {
  try {
    if (await idbGet()) {
      return true;
    }
    const legacy = await readLegacySeed();
    return Boolean(legacy?.secretB64 && legacy.publicB64);
  } catch {
    return false;
  }
}

export async function ensureExtensionDeviceSigningPublicKey(): Promise<string> {
  const record = await loadOrCreate();
  return record.publicKeyB64;
}

export async function signExtensionDeviceBindChallenge(
  message: Uint8Array,
): Promise<Uint8Array> {
  const record = await loadOrCreate();
  const signature = await crypto.subtle.sign(
    "Ed25519",
    record.privateKey,
    message as BufferSource,
  );
  return new Uint8Array(signature);
}

export async function rotateExtensionDeviceSigningKey(): Promise<string> {
  await idbClear();
  await clearLegacySeed();
  const record = await generateAndStore();
  return record.publicKeyB64;
}

export async function clearExtensionDeviceSigningKey(): Promise<void> {
  await idbClear();
  await clearLegacySeed();
}
