/**
 * Web vault unlock secrets (vault key, password share C) live in page memory only.
 *
 * Older clients wrote cleartext key material to sessionStorage under
 * `VAULT_UNLOCK_TAB_KEY` so F5 could restore an unlocked vault. That is removed:
 * reload shows the locked screen; unlock again via PIN / WebAuthn / master password.
 * Call {@link purgeLegacyVaultUnlockWebStorage} on boot and on lock/logout to drop leftovers.
 */
import { VAULT_UNLOCK_TAB_KEY } from "./storageKeys";

/**
 * Keys that previously held cleartext vault unlock material in Web Storage.
 * Kept for cleanup only — never write secrets under these names again.
 */
export const LEGACY_VAULT_UNLOCK_WEB_STORAGE_KEYS = [
  VAULT_UNLOCK_TAB_KEY,
  /** Shared-package key name; never used by web, purged if present from older experiments. */
  "okkey.vault.unlockSession.v1",
] as const;

function removeKey(storage: Storage | undefined, key: string): void {
  if (!storage || typeof storage.removeItem !== "function") {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Delete leftover cleartext unlock records from sessionStorage and localStorage. */
export function purgeLegacyVaultUnlockWebStorage(): void {
  const session =
    typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
  const local = typeof localStorage !== "undefined" ? localStorage : undefined;
  for (const key of LEGACY_VAULT_UNLOCK_WEB_STORAGE_KEYS) {
    removeKey(session, key);
    removeKey(local, key);
  }
}

/** Lock / logout / boot: ensure no cleartext vault unlock material remains in Web Storage. */
export function clearVaultUnlockSession(): void {
  purgeLegacyVaultUnlockWebStorage();
}

/**
 * Startup snapshot for this tab. Always locked: secrets are never restored from Web Storage.
 * Purges legacy keys as a side effect.
 */
export function readInitialTabVaultSession(_userId: string): {
  vaultKey: Uint8Array | null;
  passwordShareC: Uint8Array | null;
  lastActivityAt: number;
  unlocked: boolean;
} {
  purgeLegacyVaultUnlockWebStorage();
  return {
    vaultKey: null,
    passwordShareC: null,
    lastActivityAt: Date.now(),
    unlocked: false,
  };
}

/** In-memory idle check (web keeps last activity in a ref, never in Web Storage). */
export function vaultIdleExceeded(
  lastActivityAt: number,
  idleMs: number,
  now: number = Date.now(),
): boolean {
  return now - lastActivityAt >= idleMs;
}
