/**
 * Per-user, per-device vault security preferences (local only).
 * Secrets (PIN/bio wraps) live in a separate unlock store — not here.
 *
 * `pinEnabled` / `biometricEnabled` are device-local flags only. PIN and
 * biometric unlock material must never be copied or synced across devices.
 */

export type SectionReauthZoneId =
  | "capsules"
  | "monitoring"
  | "tools"
  | "workspaceSettings"
  | "personalSettings"
  | "itemPopups"
  | "capsulePopups"
  | "vaultPopups"
  | "foldersPopup"
  | "deletion";

export type VaultDevicePrefs = {
  lockOnDeviceSleep: boolean;
  /** 0 = never clear clipboard after copy. */
  clipboardClearSeconds: number;
  requireReauthZones: SectionReauthZoneId[];
  /** Per-device only — do not copy across devices. */
  pinEnabled: boolean;
  /** Per-device only — do not copy across devices. */
  biometricEnabled: boolean;
};

export type VaultDevicePrefsStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
};

export const DEFAULT_VAULT_DEVICE_PREFS: VaultDevicePrefs = {
  lockOnDeviceSleep: true,
  clipboardClearSeconds: 0,
  requireReauthZones: [],
  pinEnabled: false,
  biometricEnabled: false,
};

const ZONE_IDS: readonly SectionReauthZoneId[] = [
  "capsules",
  "monitoring",
  "tools",
  "workspaceSettings",
  "personalSettings",
  "itemPopups",
  "capsulePopups",
  "vaultPopups",
  "foldersPopup",
  "deletion",
] as const;

/** Legacy combined zone from earlier vault settings builds. */
const LEGACY_COMBINED_ZONE = "toolsAndWorkspaceSettings";

export function vaultDevicePrefsKey(userId: string): string {
  return `okkey.vault.devicePrefs.v1.u.${userId}`;
}

function isZoneId(value: unknown): value is SectionReauthZoneId {
  return typeof value === "string" && (ZONE_IDS as readonly string[]).includes(value);
}

function normalizeZones(raw: unknown[]): SectionReauthZoneId[] {
  const out = new Set<SectionReauthZoneId>();
  for (const value of raw) {
    if (value === LEGACY_COMBINED_ZONE) {
      out.add("tools");
      out.add("workspaceSettings");
      continue;
    }
    // "items" is no longer offered in vault settings; drop legacy selections.
    if (value === "items") {
      continue;
    }
    if (isZoneId(value)) {
      out.add(value);
    }
  }
  return [...out];
}

export function parseVaultDevicePrefs(raw: string | null): VaultDevicePrefs {
  if (!raw) {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const zonesRaw = Array.isArray(o.requireReauthZones) ? o.requireReauthZones : [];
    return {
      lockOnDeviceSleep:
        typeof o.lockOnDeviceSleep === "boolean"
          ? o.lockOnDeviceSleep
          : DEFAULT_VAULT_DEVICE_PREFS.lockOnDeviceSleep,
      clipboardClearSeconds:
        typeof o.clipboardClearSeconds === "number" && Number.isFinite(o.clipboardClearSeconds)
          ? Math.max(0, Math.trunc(o.clipboardClearSeconds))
          : DEFAULT_VAULT_DEVICE_PREFS.clipboardClearSeconds,
      requireReauthZones: normalizeZones(zonesRaw),
      pinEnabled: o.pinEnabled === true,
      biometricEnabled: o.biometricEnabled === true,
    };
  } catch {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
}

export function serializeVaultDevicePrefs(prefs: VaultDevicePrefs): string {
  return JSON.stringify(prefs);
}

export async function readVaultDevicePrefsAsync(
  userId: string | null,
  storage: VaultDevicePrefsStorage,
): Promise<VaultDevicePrefs> {
  if (!userId) {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
  try {
    const raw = await storage.getItem(vaultDevicePrefsKey(userId));
    return parseVaultDevicePrefs(raw);
  } catch {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
}

export async function writeVaultDevicePrefsAsync(
  userId: string,
  prefs: VaultDevicePrefs,
  storage: VaultDevicePrefsStorage,
): Promise<void> {
  await storage.setItem(vaultDevicePrefsKey(userId), serializeVaultDevicePrefs(prefs));
}

export async function patchVaultDevicePrefsAsync(
  userId: string,
  patch: Partial<VaultDevicePrefs>,
  storage: VaultDevicePrefsStorage,
): Promise<VaultDevicePrefs> {
  const next = { ...(await readVaultDevicePrefsAsync(userId, storage)), ...patch };
  await writeVaultDevicePrefsAsync(userId, next, storage);
  return next;
}

export const SECTION_REAUTH_ZONE_IDS = ZONE_IDS;

export const IDLE_LOCK_OPTIONS_SECONDS = [60, 300, 900, 1800, 3600, 14_400] as const;

export const CLIPBOARD_CLEAR_OPTIONS_SECONDS = [0, 10, 30, 60, 120, 300] as const;
