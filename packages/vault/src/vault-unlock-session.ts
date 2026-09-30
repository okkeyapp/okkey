/**
 * Temporary unlock-session record for vault key material.
 * Never stores the master password — only vault key + optional password share C
 * as base64, plus idle activity metadata.
 */
import { base64ToBytes, bytesToBase64 } from "./base64.js";
import { DEFAULT_VAULT_IDLE_LOCK_MS } from "./vault-idle-lock-ms.js";

const VERSION = 1 as const;

export const VAULT_UNLOCK_SESSION_STORAGE_KEY = "okkey.vault.unlockSession.v1";

export type VaultUnlockSessionRecord = {
  v: 1;
  user_id: string;
  vault_key_b64: string;
  password_share_c_b64?: string;
  last_activity_at: number;
  idle_lock_ms: number;
};

export type VaultUnlockSessionStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

export type VaultUnlockSessionFreshResult = {
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array | null;
  lastActivityAt: number;
  idleLockMs: number;
};

function parseRecord(raw: string | null): VaultUnlockSessionRecord | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const o = JSON.parse(raw) as Partial<VaultUnlockSessionRecord>;
    if (o.v !== VERSION || !o.user_id?.trim() || !o.vault_key_b64?.trim()) {
      return null;
    }
    if (typeof o.last_activity_at !== "number" || !Number.isFinite(o.last_activity_at)) {
      return null;
    }
    const idleLockMs =
      typeof o.idle_lock_ms === "number" && Number.isFinite(o.idle_lock_ms) && o.idle_lock_ms > 0
        ? o.idle_lock_ms
        : DEFAULT_VAULT_IDLE_LOCK_MS;
    return {
      v: VERSION,
      user_id: o.user_id,
      vault_key_b64: o.vault_key_b64,
      ...(o.password_share_c_b64 ? { password_share_c_b64: o.password_share_c_b64 } : {}),
      last_activity_at: o.last_activity_at,
      idle_lock_ms: idleLockMs,
    };
  } catch {
    return null;
  }
}

async function storageGet(
  storage: VaultUnlockSessionStorage,
  key: string,
): Promise<string | null> {
  return await storage.getItem(key);
}

async function storageSet(
  storage: VaultUnlockSessionStorage,
  key: string,
  value: string,
): Promise<void> {
  await storage.setItem(key, value);
}

async function storageRemove(storage: VaultUnlockSessionStorage, key: string): Promise<void> {
  await storage.removeItem(key);
}

/**
 * Persist unlock session. Stores vault key (+ optional password share C) only —
 * never the master password.
 */
export async function persistVaultUnlockSession(
  storage: VaultUnlockSessionStorage,
  opts: {
    userId: string;
    vaultKey: Uint8Array;
    passwordShareC?: Uint8Array;
    idleLockMs: number;
    storageKey?: string;
  },
): Promise<void> {
  const key = opts.storageKey ?? VAULT_UNLOCK_SESSION_STORAGE_KEY;
  const rec: VaultUnlockSessionRecord = {
    v: VERSION,
    user_id: opts.userId,
    vault_key_b64: bytesToBase64(opts.vaultKey),
    ...(opts.passwordShareC
      ? { password_share_c_b64: bytesToBase64(opts.passwordShareC) }
      : {}),
    last_activity_at: Date.now(),
    idle_lock_ms: opts.idleLockMs > 0 ? opts.idleLockMs : DEFAULT_VAULT_IDLE_LOCK_MS,
  };
  await storageSet(storage, key, JSON.stringify(rec));
}

export async function touchVaultUnlockSession(
  storage: VaultUnlockSessionStorage,
  userId: string,
  storageKey: string = VAULT_UNLOCK_SESSION_STORAGE_KEY,
): Promise<void> {
  const rec = parseRecord(await storageGet(storage, storageKey));
  if (!rec || rec.user_id !== userId) {
    return;
  }
  rec.last_activity_at = Date.now();
  await storageSet(storage, storageKey, JSON.stringify(rec));
}

/**
 * Returns key material if a record exists, user matches, and idle time is
 * within the record's `idle_lock_ms`. Clears storage when stale or corrupt.
 */
export async function readVaultUnlockSessionIfFresh(
  storage: VaultUnlockSessionStorage,
  userId: string,
  storageKey: string = VAULT_UNLOCK_SESSION_STORAGE_KEY,
): Promise<VaultUnlockSessionFreshResult | null> {
  const rec = parseRecord(await storageGet(storage, storageKey));
  if (!rec || rec.user_id !== userId) {
    return null;
  }
  const now = Date.now();
  if (now - rec.last_activity_at >= rec.idle_lock_ms) {
    await storageRemove(storage, storageKey);
    return null;
  }
  try {
    const vaultKey = base64ToBytes(rec.vault_key_b64);
    const passwordShareC = rec.password_share_c_b64
      ? base64ToBytes(rec.password_share_c_b64)
      : null;
    return {
      vaultKey,
      passwordShareC,
      lastActivityAt: rec.last_activity_at,
      idleLockMs: rec.idle_lock_ms,
    };
  } catch {
    await storageRemove(storage, storageKey);
    return null;
  }
}

export async function clearVaultUnlockSession(
  storage: VaultUnlockSessionStorage,
  storageKey: string = VAULT_UNLOCK_SESSION_STORAGE_KEY,
): Promise<void> {
  await storageRemove(storage, storageKey);
}

/** true if there is no record, user mismatches, or ≥ idle_lock_ms since last_activity. */
export async function vaultUnlockSessionExceededIdle(
  storage: VaultUnlockSessionStorage,
  userId: string,
  storageKey: string = VAULT_UNLOCK_SESSION_STORAGE_KEY,
): Promise<boolean> {
  const rec = parseRecord(await storageGet(storage, storageKey));
  if (!rec || rec.user_id !== userId) {
    return true;
  }
  return Date.now() - rec.last_activity_at >= rec.idle_lock_ms;
}
