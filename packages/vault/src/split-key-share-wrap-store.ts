/**
 * Device wrap key for split-key share B.
 * Stored outside the vault bundle so unlock can open the hybrid envelope
 * before VaultKey exists. IndexedDB is per origin.
 */
import type { SplitKeyShareWrapKey } from "@okkey/crypto";

const DB_NAME = "okkey.share-wrap";
const DB_VERSION = 1;
const STORE = "keys";

type WrapRecord = {
  id: string;
  ed25519Seed: ArrayBuffer;
  ed25519PublicKey: ArrayBuffer;
  mlkemDecapsulationKey: ArrayBuffer;
  mlkemEncapsulationKey: ArrayBuffer;
};

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  return new Uint8Array(value);
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

function isBytes(value: unknown): value is ArrayBuffer | Uint8Array {
  return value instanceof ArrayBuffer || value instanceof Uint8Array;
}

function isWrapRecord(value: unknown): value is WrapRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    isBytes(record.ed25519Seed) &&
    isBytes(record.ed25519PublicKey) &&
    isBytes(record.mlkemDecapsulationKey) &&
    isBytes(record.mlkemEncapsulationKey)
  );
}

async function idbGet(id: string): Promise<SplitKeyShareWrapKey | null> {
  const db = await openDb();
  try {
    const row = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
    });
    if (!isWrapRecord(row) || !row.ed25519PublicKey || !row.mlkemEncapsulationKey) {
      return null;
    }
    return {
      ed25519Seed: toBytes(row.ed25519Seed),
      ed25519PublicKey: toBytes(row.ed25519PublicKey),
      mlkemDecapsulationKey: toBytes(row.mlkemDecapsulationKey),
      mlkemEncapsulationKey: toBytes(row.mlkemEncapsulationKey),
    };
  } finally {
    db.close();
  }
}

export async function persistSplitKeyShareWrapKey(
  userId: string,
  key: SplitKeyShareWrapKey,
): Promise<void> {
  const id = userId.trim();
  if (!id) {
    throw new Error("userId is required to store a share wrap key");
  }
  const record: WrapRecord = {
    id,
    ed25519Seed: copyBytes(key.ed25519Seed),
    ed25519PublicKey: copyBytes(key.ed25519PublicKey),
    mlkemDecapsulationKey: copyBytes(key.mlkemDecapsulationKey),
    mlkemEncapsulationKey: copyBytes(key.mlkemEncapsulationKey),
  };
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

export async function loadSplitKeyShareWrapKey(
  userId: string,
): Promise<SplitKeyShareWrapKey | null> {
  const id = userId.trim();
  if (!id) {
    return null;
  }
  const own = await idbGet(id);
  if (own) {
    return own;
  }
  // Registration stores the key before the user id exists. Read it until the
  // success path copies it onto the user id.
  if (id === "pending") {
    return null;
  }
  return idbGet("pending");
}

export async function clearSplitKeyShareWrapKey(userId: string): Promise<void> {
  const id = userId.trim();
  if (!id || typeof indexedDB === "undefined") {
    return;
  }
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB delete failed"));
    });
  } finally {
    db.close();
  }
}
