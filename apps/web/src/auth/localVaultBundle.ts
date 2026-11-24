/**
 * Device-side split-key material: per-user localStorage (survives logout and new tabs)
 * plus a session mirror of the same record.
 *
 * The server share is not part of that record. It is fetched after authentication
 * and kept only in memory until vault lock or logout
 * (`server-key-share-memory` in `@okkey/vault`).
 * A legacy record may still contain `server_key_share_b64` until the next online unlock.
 */
import {
  mapVaultUnlockBootstrapToStored,
  omitServerKeyShare,
  parseStoredVaultBundle,
  type StoredVaultBundle,
} from "@okkey/vault";

import {
  VAULT_BUNDLE_PENDING_KEY,
  VAULT_BUNDLE_STORAGE_KEY,
  vaultBundleScopedStorageKey,
} from "./storageKeys";
import { markLockOnDeviceSleepDefaultForNewInstall } from "./vaultDevicePrefs";

export type { StoredVaultBundle };
export { mapVaultUnlockBootstrapToStored };

function parseBundle(raw: string | null): StoredVaultBundle | null {
  if (!raw) {
    return null;
  }
  try {
    return parseStoredVaultBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}

function sessionStorageOk(): boolean {
  return (
    typeof sessionStorage !== "undefined" &&
    typeof sessionStorage.getItem === "function" &&
    typeof sessionStorage.setItem === "function" &&
    typeof sessionStorage.removeItem === "function"
  );
}

function localStorageOk(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    typeof localStorage.getItem === "function" &&
    typeof localStorage.setItem === "function" &&
    typeof localStorage.removeItem === "function"
  );
}

function readLocalKey(key: string): StoredVaultBundle | null {
  if (!localStorageOk()) {
    return null;
  }
  return parseBundle(localStorage.getItem(key));
}

function persistableJson(bundle: StoredVaultBundle): string {
  return JSON.stringify(omitServerKeyShare(bundle));
}

/** Session mirror never receives the server share, even when localStorage still has a legacy copy. */
function syncSessionMirror(bundle: StoredVaultBundle): void {
  if (sessionStorageOk()) {
    sessionStorage.setItem(VAULT_BUNDLE_STORAGE_KEY, persistableJson(bundle));
  }
}

/**
 * @param userId — current user from session; `null` during registration before token is issued.
 * The returned object may still include a legacy `server_key_share_b64` read from disk.
 */
export function readVaultBundle(userId: string | null): StoredVaultBundle | null {
  if (userId) {
    const scopedKey = vaultBundleScopedStorageKey(userId);
    let bundle = readLocalKey(scopedKey);

    if (!bundle && localStorageOk()) {
      const legacy = readLocalKey(VAULT_BUNDLE_STORAGE_KEY);
      if (legacy) {
        try {
          // Keep a legacy server share on disk until an online unlock removes it.
          // Copying the raw record preserves that fallback across the key rename.
          localStorage.setItem(scopedKey, localStorage.getItem(VAULT_BUNDLE_STORAGE_KEY) ?? "");
          localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        bundle = legacy;
      }
    }

    if (bundle) {
      syncSessionMirror(bundle);
      return bundle;
    }

    if (sessionStorageOk()) {
      return parseBundle(sessionStorage.getItem(VAULT_BUNDLE_STORAGE_KEY));
    }
    return null;
  }

  if (sessionStorageOk()) {
    const s = parseBundle(sessionStorage.getItem(VAULT_BUNDLE_STORAGE_KEY));
    if (s) {
      return s;
    }
  }
  return readLocalKey(VAULT_BUNDLE_PENDING_KEY);
}

export function writeVaultBundle(bundle: StoredVaultBundle, userId: string | null): void {
  const json = persistableJson(bundle);
  syncSessionMirror(bundle);
  if (!localStorageOk()) {
    return;
  }
  try {
    if (userId) {
      const scopedKey = vaultBundleScopedStorageKey(userId);
      const creatingFirstBundle =
        !localStorage.getItem(scopedKey) && !localStorage.getItem(VAULT_BUNDLE_STORAGE_KEY);
      if (creatingFirstBundle) {
        markLockOnDeviceSleepDefaultForNewInstall(userId);
      }
      localStorage.setItem(scopedKey, json);
    } else {
      localStorage.setItem(VAULT_BUNDLE_PENDING_KEY, json);
    }
  } catch {
    /* quota / private mode */
  }
}

/** After registration: move pending bundle into the user's scoped storage. */
export function finalizePendingVaultBundle(userId: string): void {
  if (!localStorageOk()) {
    return;
  }
  const pendingRaw = localStorage.getItem(VAULT_BUNDLE_PENDING_KEY);
  if (!pendingRaw) {
    return;
  }
  const scopedKey = vaultBundleScopedStorageKey(userId);
  const parsed = parseBundle(pendingRaw);
  try {
    if (!localStorage.getItem(scopedKey)) {
      markLockOnDeviceSleepDefaultForNewInstall(userId);
    }
    localStorage.setItem(scopedKey, parsed ? persistableJson(parsed) : pendingRaw);
    localStorage.removeItem(VAULT_BUNDLE_PENDING_KEY);
    localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Migrate legacy single key `okkey.vault.bundle` to the user's scoped key (one account per browser profile). */
export function migrateLegacyVaultBundleToUser(userId: string): void {
  if (!localStorageOk()) {
    return;
  }
  const scopedKey = vaultBundleScopedStorageKey(userId);
  if (localStorage.getItem(scopedKey)) {
    return;
  }
  const legacy = localStorage.getItem(VAULT_BUNDLE_STORAGE_KEY);
  if (!legacy) {
    return;
  }
  try {
    localStorage.setItem(scopedKey, legacy);
    localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Logout: clear sessionStorage mirror only; keep the user's local key material. */
export function clearVaultBundleSessionMirror(): void {
  if (sessionStorageOk()) {
    sessionStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  }
}

/** Incomplete registration — do not leave pending data for another account in this browser. */
export function clearPendingVaultBundle(): void {
  if (!localStorageOk()) {
    return;
  }
  try {
    localStorage.removeItem(VAULT_BUNDLE_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Full wipe (rare): legacy + pending + scoped storage for one userId. */
export function clearVaultBundleForUser(userId: string): void {
  clearVaultBundleSessionMirror();
  if (!localStorageOk()) {
    return;
  }
  try {
    localStorage.removeItem(vaultBundleScopedStorageKey(userId));
    localStorage.removeItem(VAULT_BUNDLE_PENDING_KEY);
    localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
