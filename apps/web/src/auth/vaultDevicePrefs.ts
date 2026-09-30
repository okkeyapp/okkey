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
  parseVaultDevicePrefs,
  serializeVaultDevicePrefs,
  vaultDevicePrefsKey,
  type SectionReauthZoneId,
  type VaultDevicePrefs,
} from "@okkey/vault";

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

export function readVaultDevicePrefs(userId: string | null): VaultDevicePrefs {
  if (!userId || typeof localStorage === "undefined") {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
  try {
    return parseVaultDevicePrefs(localStorage.getItem(vaultDevicePrefsKey(userId)));
  } catch {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
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
