/**
 * Extension device signing key for bind-session proofs.
 *
 * Source of truth is a 32-byte Ed25519 seed in IndexedDB (not chrome.storage).
 * A non-extractable WebCrypto CryptoKey mirror is stored alongside when possible.
 * Signing never silently mints a new key.
 */

import { ed25519Keypair, ed25519Sign, initCrypto, wipeBytes } from "@okkey/crypto";

import { STORAGE_KEYS } from "./storage.ts";

const DB_NAME = "okkey.extension.device.signing";
const DB_VERSION = 2;
const STORE = "keys";
const RECORD_ID = "current";

type StoredDeviceSigningKey = {
  id: typeof RECORD_ID;
  seed: ArrayBuffer;
  publicKeyB64: string;
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
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
  await clearLegacySeed();
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
  const legacy = await readLegacySeed();
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
  const record = await loadExisting();
  if (!record) {
    throw new Error("device private key is missing");
  }
  const msg =
    message.byteOffset === 0 && message.byteLength === message.buffer.byteLength
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
      /* fall through */
    }
  }

  await initCrypto();
  const seed = copySeed(record.seed);
  try {
    return ed25519Sign(seed, msg);
  } finally {
    wipeBytes(seed);
  }
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
