/**
 * Per-user, per-device vault security preferences (local only).
 * Secrets (PIN/bio wraps) live in vaultDeviceUnlockStore — not here.
 *
 * PIN / biometric flags are device-local and must not be copied across devices.
 */
import {
  CLIPBOARD_CLEAR_OPTIONS_SECONDS,
  DEFAULT_VAULT_DEVICE_PREFS,
  IDLE_LOCK_OPTIONS_SECONDS,
  SECTION_REAUTH_ZONE_IDS,
  lockOnSleepMigrationMarkerValue,
  needsFreshLockOnSleepDefaultMark,
  resolveVaultDevicePrefsRead,
  serializeVaultDevicePrefs,
  vaultDevicePrefsKey,
  vaultLockOnSleepMigrationKey,
  type SectionReauthZoneId,
  type VaultDevicePrefs,
} from "@okkey/vault";

import { VAULT_BUNDLE_STORAGE_KEY, vaultBundleScopedStorageKey } from "./storageKeys";

export type { SectionReauthZoneId, VaultDevicePrefs };
export {
  CLIPBOARD_CLEAR_OPTIONS_SECONDS,
  IDLE_LOCK_OPTIONS_SECONDS,
  SECTION_REAUTH_ZONE_IDS,
};

/** Pathname-gated zones — unlock clears when leaving that path area. */
export const SECTION_REAUTH_PATH_ZONE_IDS: readonly SectionReauthZoneId[] = [
  "capsules",
  "monitoring",
  "tools",
  "workspaceSettings",
] as const;

/**
 * Prior local vault for this user. The scoped bundle is written on unlock and
 * survives logout. The legacy unscoped key is the same record from before
 * per-user storage. Session and profile keys are not used: login writes those
 * before the first prefs read, including on a brand-new device.
 */
function hasPriorLocalVault(userId: string): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  if (localStorage.getItem(vaultBundleScopedStorageKey(userId))) {
    return true;
  }
  return Boolean(localStorage.getItem(VAULT_BUNDLE_STORAGE_KEY));
}

function applyLockOnSleepReadPlan(userId: string): VaultDevicePrefs {
  const plan = resolveVaultDevicePrefsRead({
    savedPrefsRaw: localStorage.getItem(vaultDevicePrefsKey(userId)),
    migrationMarkerRaw: localStorage.getItem(vaultLockOnSleepMigrationKey(userId)),
    hasPriorUserState: hasPriorLocalVault(userId),
  });
  if (plan.persistPrefs) {
    localStorage.setItem(vaultDevicePrefsKey(userId), serializeVaultDevicePrefs(plan.prefs));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("okkey:vault-device-prefs", { detail: { userId } }));
    }
  }
  if (plan.persistMigrationMarker) {
    localStorage.setItem(vaultLockOnSleepMigrationKey(userId), lockOnSleepMigrationMarkerValue());
  }
  return plan.prefs;
}

export function readVaultDevicePrefs(userId: string | null): VaultDevicePrefs {
  if (!userId || typeof localStorage === "undefined") {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
  try {
    return applyLockOnSleepReadPlan(userId);
  } catch {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
}

/**
 * Call before the first local vault bundle is stored for a user who had none,
 * so that bundle is not treated as a pre-upgrade vault. Does not change prefs.
 */
export function markLockOnDeviceSleepDefaultForNewInstall(userId: string): void {
  if (!userId || typeof localStorage === "undefined") {
    return;
  }
  try {
    const markerKey = vaultLockOnSleepMigrationKey(userId);
    if (
      !needsFreshLockOnSleepDefaultMark(
        localStorage.getItem(vaultDevicePrefsKey(userId)),
        localStorage.getItem(markerKey),
      )
    ) {
      return;
    }
    localStorage.setItem(markerKey, lockOnSleepMigrationMarkerValue());
  } catch {
    /* quota / private mode */
  }
}

export function writeVaultDevicePrefs(userId: string, prefs: VaultDevicePrefs): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(vaultDevicePrefsKey(userId), serializeVaultDevicePrefs(prefs));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("okkey:vault-device-prefs", { detail: { userId } }));
    }
  } catch {
    /* quota / private mode */
  }
}

export function patchVaultDevicePrefs(
  userId: string,
  patch: Partial<VaultDevicePrefs>,
): VaultDevicePrefs {
  const next = { ...readVaultDevicePrefs(userId), ...patch };
  writeVaultDevicePrefs(userId, next);
  return next;
}
