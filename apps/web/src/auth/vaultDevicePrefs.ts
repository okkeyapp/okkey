/**
 * Per-user, per-device vault security preferences (local only).
 * Secrets (PIN/bio wraps) live in vaultDeviceUnlockStore — not here.
 */

export type SectionReauthZoneId =
  | "items"
  | "capsules"
  | "monitoring"
  | "toolsAndWorkspaceSettings";

export type VaultDevicePrefs = {
  lockOnDeviceSleep: boolean;
  /** 0 = never clear clipboard after copy. */
  clipboardClearSeconds: number;
  requireReauthZones: SectionReauthZoneId[];
  pinEnabled: boolean;
  biometricEnabled: boolean;
};

const DEFAULT_PREFS: VaultDevicePrefs = {
  lockOnDeviceSleep: true,
  clipboardClearSeconds: 0,
  requireReauthZones: [],
  pinEnabled: false,
  biometricEnabled: false,
};

const ZONE_IDS: readonly SectionReauthZoneId[] = [
  "items",
  "capsules",
  "monitoring",
  "toolsAndWorkspaceSettings",
] as const;

function prefsKey(userId: string): string {
  return `okkey.vault.devicePrefs.v1.u.${userId}`;
}

function isZoneId(value: unknown): value is SectionReauthZoneId {
  return typeof value === "string" && (ZONE_IDS as readonly string[]).includes(value);
}

function parsePrefs(raw: string | null): VaultDevicePrefs {
  if (!raw) {
    return { ...DEFAULT_PREFS };
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const zonesRaw = Array.isArray(o.requireReauthZones) ? o.requireReauthZones : [];
    const requireReauthZones = zonesRaw.filter(isZoneId);
    return {
      lockOnDeviceSleep: typeof o.lockOnDeviceSleep === "boolean" ? o.lockOnDeviceSleep : DEFAULT_PREFS.lockOnDeviceSleep,
      clipboardClearSeconds:
        typeof o.clipboardClearSeconds === "number" && Number.isFinite(o.clipboardClearSeconds)
          ? Math.max(0, Math.trunc(o.clipboardClearSeconds))
          : DEFAULT_PREFS.clipboardClearSeconds,
      requireReauthZones,
      pinEnabled: o.pinEnabled === true,
      biometricEnabled: o.biometricEnabled === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function readVaultDevicePrefs(userId: string | null): VaultDevicePrefs {
  if (!userId || typeof localStorage === "undefined") {
    return { ...DEFAULT_PREFS };
  }
  try {
    return parsePrefs(localStorage.getItem(prefsKey(userId)));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeVaultDevicePrefs(userId: string, prefs: VaultDevicePrefs): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
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

export const SECTION_REAUTH_ZONE_IDS = ZONE_IDS;

export const IDLE_LOCK_OPTIONS_SECONDS = [60, 300, 900, 1800, 3600, 14_400] as const;

export const CLIPBOARD_CLEAR_OPTIONS_SECONDS = [0, 10, 30, 60, 120, 300] as const;
