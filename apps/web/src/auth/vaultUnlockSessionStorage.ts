/**
 * Temporary storage for unlocked vault key in this tab’s sessionStorage.
 * — Survives full page reload (F5).
 * — Cleared when the tab closes (unlike access token in localStorage).
 * — XSS-sensitive on same origin; mitigate with CSP. Master password and key never go to the server.
 */
import { base64ToBytes, bytesToBase64 } from "./base64";
import { VAULT_UNLOCK_TAB_KEY } from "./storageKeys";
import { DEFAULT_VAULT_IDLE_LOCK_MS } from "./vaultIdleLockMs";

const VERSION = 1 as const;

export type VaultUnlockTabRecord = {
  v: typeof VERSION;
  user_id: string;
  vault_key_b64: string;
  password_share_c_b64?: string;
  last_activity_at: number;
};

function parseRecord(raw: string | null): VaultUnlockTabRecord | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const o = JSON.parse(raw) as VaultUnlockTabRecord;
    if (o.v !== VERSION || !o.user_id?.trim() || !o.vault_key_b64?.trim()) {
      return null;
    }
    if (typeof o.last_activity_at !== "number" || !Number.isFinite(o.last_activity_at)) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

export function persistVaultUnlockSession(
  userId: string,
  vaultKey: Uint8Array,
  passwordShareC?: Uint8Array,
): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const rec: VaultUnlockTabRecord = {
    v: VERSION,
    user_id: userId,
    vault_key_b64: bytesToBase64(vaultKey),
    ...(passwordShareC ? { password_share_c_b64: bytesToBase64(passwordShareC) } : {}),
    last_activity_at: Date.now(),
  };
  sessionStorage.setItem(VAULT_UNLOCK_TAB_KEY, JSON.stringify(rec));
}

export function touchVaultUnlockSession(userId: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const rec = parseRecord(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY));
  if (!rec || rec.user_id !== userId) {
    return;
  }
  rec.last_activity_at = Date.now();
  sessionStorage.setItem(VAULT_UNLOCK_TAB_KEY, JSON.stringify(rec));
}

/**
 * Returns key and last activity if a record exists, user matches, and idle time is within idleMs.
 */
export function readVaultUnlockSessionIfFresh(
  userId: string,
  idleMs: number,
): { vaultKey: Uint8Array; passwordShareC: Uint8Array | null; lastActivityAt: number } | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  const rec = parseRecord(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY));
  if (!rec || rec.user_id !== userId) {
    return null;
  }
  const now = Date.now();
  if (now - rec.last_activity_at >= idleMs) {
    sessionStorage.removeItem(VAULT_UNLOCK_TAB_KEY);
    return null;
  }
  try {
    const vaultKey = base64ToBytes(rec.vault_key_b64);
    const passwordShareC = rec.password_share_c_b64
      ? base64ToBytes(rec.password_share_c_b64)
      : null;
    return { vaultKey, passwordShareC, lastActivityAt: rec.last_activity_at };
  } catch {
    sessionStorage.removeItem(VAULT_UNLOCK_TAB_KEY);
    return null;
  }
}

/** Synchronous read on app startup (before first paint), default idle aligned with server. */
export function readInitialTabVaultSession(userId: string): {
  vaultKey: Uint8Array | null;
  passwordShareC: Uint8Array | null;
  lastActivityAt: number;
  unlocked: boolean;
} {
  const r = readVaultUnlockSessionIfFresh(userId, DEFAULT_VAULT_IDLE_LOCK_MS);
  if (!r) {
    return { vaultKey: null, passwordShareC: null, lastActivityAt: Date.now(), unlocked: false };
  }
  return {
    vaultKey: r.vaultKey,
    passwordShareC: r.passwordShareC,
    lastActivityAt: r.lastActivityAt,
    unlocked: true,
  };
}

export function clearVaultUnlockSession(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.removeItem(VAULT_UNLOCK_TAB_KEY);
}

/** true if there is no record, user mismatches, or ≥ idleMs since last_activity (vault should lock). */
export function vaultUnlockSessionExceededIdle(userId: string, idleMs: number): boolean {
  if (typeof sessionStorage === "undefined") {
    return true;
  }
  const rec = parseRecord(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY));
  if (!rec || rec.user_id !== userId) {
    return true;
  }
  return Date.now() - rec.last_activity_at >= idleMs;
}
