/**
 * localStorage: Bearer session JSON (survives browser restart; cleared on logout).
 * May have lived in sessionStorage before — `readStoredSession` migrates on read.
 */
export const SESSION_STORAGE_KEY = "okkey.access.session";
/** sessionStorage: unlocked vault key material for this tab (survives F5, not tab close). */
export const VAULT_UNLOCK_TAB_KEY = "okkey.vault.unlock.tab";
/** sessionStorage + localStorage: split-key material for unlock (XSS-sensitive; see localVaultBundle) */
export const VAULT_BUNDLE_STORAGE_KEY = "okkey.vault.bundle";
/** localStorage: registration bundle before user id is known */
export const VAULT_BUNDLE_PENDING_KEY = `${VAULT_BUNDLE_STORAGE_KEY}.pending`;

export function vaultBundleScopedStorageKey(userId: string): string {
  return `${VAULT_BUNDLE_STORAGE_KEY}.u.${userId}`;
}

export function profileScopedStorageKey(userId: string): string {
  return `okkey.profile.u.${userId}`;
}

/** sessionStorage: profile mirror during auth; durable copy lives in localStorage per user id */
export const PROFILE_STORAGE_KEY = "okkey.profile.local";
/** localStorage: stable 64-char hex device fingerprint */
export const DEVICE_FINGERPRINT_KEY = "okkey.device.fingerprint";
