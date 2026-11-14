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
  /**
   * Extension-only: lock vault immediately when the browser action popup closes.
   * Default off. Web ignores this flag.
   */
  lockOnPopupClose: boolean;
  /**
   * Idle lock timeout in seconds (device-local).
   * Absent until the user sets it or a one-time migration from the former
   * server `vault_idle_lock_seconds` runs on this device.
   */
  idleLockSeconds?: number;
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

/**
 * Defaults for a user/device with no saved prefs and no local vault from
 * before this default changed. `lockOnDeviceSleep` used to be on; upgrades
 * keep that via {@link resolveVaultDevicePrefsRead}.
 */
export const DEFAULT_VAULT_DEVICE_PREFS: VaultDevicePrefs = {
  lockOnDeviceSleep: false,
  lockOnPopupClose: false,
  clipboardClearSeconds: 0,
  requireReauthZones: [],
  pinEnabled: false,
  biometricEnabled: false,
};

/**
 * Product default before `lockOnDeviceSleep` shipped as off.
 * A stored prefs record that omits the field keeps this value and is not rewritten.
 */
export const LEGACY_LOCK_ON_DEVICE_SLEEP = true;

/** Bump to re-run the one-time sleep-lock migration. The storage key includes this. */
export const LOCK_ON_DEVICE_SLEEP_MIGRATION_VERSION = 1;

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

/** One-time marker so the sleep-lock migration does not run again for this user. */
export function vaultLockOnSleepMigrationKey(userId: string): string {
  return `okkey.vault.devicePrefs.lockOnSleepMigration.v${LOCK_ON_DEVICE_SLEEP_MIGRATION_VERSION}.u.${userId}`;
}

export function lockOnSleepMigrationMarkerValue(): string {
  return String(LOCK_ON_DEVICE_SLEEP_MIGRATION_VERSION);
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

function hasStoredPrefsRecord(raw: string | null): boolean {
  return raw != null && raw !== "";
}

export function parseVaultDevicePrefs(raw: string | null): VaultDevicePrefs {
  if (!hasStoredPrefsRecord(raw)) {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
  try {
    const parsed = JSON.parse(raw as string) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_VAULT_DEVICE_PREFS, lockOnDeviceSleep: LEGACY_LOCK_ON_DEVICE_SLEEP };
    }
    const o = parsed as Record<string, unknown>;
    const zonesRaw = Array.isArray(o.requireReauthZones) ? o.requireReauthZones : [];
    const idleRaw = o.idleLockSeconds;
    const idleLockSeconds =
      typeof idleRaw === "number" && Number.isFinite(idleRaw)
        ? Math.max(0, Math.trunc(idleRaw))
        : undefined;
    return {
      lockOnDeviceSleep:
        typeof o.lockOnDeviceSleep === "boolean"
          ? o.lockOnDeviceSleep
          : LEGACY_LOCK_ON_DEVICE_SLEEP,
      lockOnPopupClose:
        typeof o.lockOnPopupClose === "boolean"
          ? o.lockOnPopupClose
          : DEFAULT_VAULT_DEVICE_PREFS.lockOnPopupClose,
      ...(idleLockSeconds !== undefined ? { idleLockSeconds } : {}),
      clipboardClearSeconds:
        typeof o.clipboardClearSeconds === "number" && Number.isFinite(o.clipboardClearSeconds)
          ? Math.max(0, Math.trunc(o.clipboardClearSeconds))
          : DEFAULT_VAULT_DEVICE_PREFS.clipboardClearSeconds,
      requireReauthZones: normalizeZones(zonesRaw),
      pinEnabled: o.pinEnabled === true,
      biometricEnabled: o.biometricEnabled === true,
    };
  } catch {
    return { ...DEFAULT_VAULT_DEVICE_PREFS, lockOnDeviceSleep: LEGACY_LOCK_ON_DEVICE_SLEEP };
  }
}

export type VaultDevicePrefsReadPlan = {
  prefs: VaultDevicePrefs;
  /** Write `prefs` when upgrading a device that already had a local vault. */
  persistPrefs: boolean;
  /** Write the version marker. False when a saved prefs record already exists. */
  persistMigrationMarker: boolean;
};

/**
 * Decide sleep-lock prefs on read.
 *
 * - Saved prefs record: return it unchanged (no writes).
 * - Migration marker already stored: new default, no writes.
 * - No record, but this device already had a local vault for the user: persist
 *   the previous default (`lockOnDeviceSleep: true`) and the version marker once.
 * - No record and no prior vault: new default (`false`) and the version marker
 *   so a vault created afterwards is not treated as an upgrade.
 */
export function resolveVaultDevicePrefsRead(input: {
  savedPrefsRaw: string | null;
  migrationMarkerRaw: string | null;
  hasPriorUserState: boolean;
}): VaultDevicePrefsReadPlan {
  if (hasStoredPrefsRecord(input.savedPrefsRaw)) {
    return {
      prefs: parseVaultDevicePrefs(input.savedPrefsRaw),
      persistPrefs: false,
      persistMigrationMarker: false,
    };
  }
  const marker = lockOnSleepMigrationMarkerValue();
  if (input.migrationMarkerRaw === marker) {
    return {
      prefs: { ...DEFAULT_VAULT_DEVICE_PREFS },
      persistPrefs: false,
      persistMigrationMarker: false,
    };
  }
  if (input.hasPriorUserState) {
    return {
      prefs: { ...DEFAULT_VAULT_DEVICE_PREFS, lockOnDeviceSleep: LEGACY_LOCK_ON_DEVICE_SLEEP },
      persistPrefs: true,
      persistMigrationMarker: true,
    };
  }
  return {
    prefs: { ...DEFAULT_VAULT_DEVICE_PREFS },
    persistPrefs: false,
    persistMigrationMarker: true,
  };
}

/** True when a brand-new local vault should record the new sleep-lock default first. */
export function needsFreshLockOnSleepDefaultMark(
  savedPrefsRaw: string | null,
  migrationMarkerRaw: string | null,
): boolean {
  if (hasStoredPrefsRecord(savedPrefsRaw)) {
    return false;
  }
  return migrationMarkerRaw !== lockOnSleepMigrationMarkerValue();
}

export function serializeVaultDevicePrefs(prefs: VaultDevicePrefs): string {
  return JSON.stringify(prefs);
}

export async function readVaultDevicePrefsMigratingLockOnSleep(
  userId: string | null,
  storage: VaultDevicePrefsStorage,
  hasPriorUserState: boolean,
): Promise<VaultDevicePrefs> {
  if (!userId) {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
  try {
    const savedPrefsRaw = await storage.getItem(vaultDevicePrefsKey(userId));
    const migrationMarkerRaw = await storage.getItem(vaultLockOnSleepMigrationKey(userId));
    const plan = resolveVaultDevicePrefsRead({
      savedPrefsRaw,
      migrationMarkerRaw,
      hasPriorUserState,
    });
    if (plan.persistPrefs) {
      await storage.setItem(vaultDevicePrefsKey(userId), serializeVaultDevicePrefs(plan.prefs));
    }
    if (plan.persistMigrationMarker) {
      await storage.setItem(
        vaultLockOnSleepMigrationKey(userId),
        lockOnSleepMigrationMarkerValue(),
      );
    }
    return plan.prefs;
  } catch {
    return { ...DEFAULT_VAULT_DEVICE_PREFS };
  }
}

/**
 * Call before creating the first local vault bundle for a user who had none.
 * Records the new sleep-lock default so that bundle is not later treated as
 * pre-upgrade state. Does not write or modify device prefs.
 */
export async function markLockOnDeviceSleepDefaultForNewInstall(
  userId: string,
  storage: VaultDevicePrefsStorage,
): Promise<void> {
  const savedPrefsRaw = await storage.getItem(vaultDevicePrefsKey(userId));
  const markerKey = vaultLockOnSleepMigrationKey(userId);
  const migrationMarkerRaw = await storage.getItem(markerKey);
  if (!needsFreshLockOnSleepDefaultMark(savedPrefsRaw, migrationMarkerRaw)) {
    return;
  }
  await storage.setItem(markerKey, lockOnSleepMigrationMarkerValue());
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
