/**
 * Extension adapters for vault unlock session (chrome.storage.session) and
 * device prefs (chrome.storage.local). Master password is never persisted.
 */
import {
  clearVaultUnlockSession,
  DEFAULT_VAULT_DEVICE_PREFS,
  persistVaultUnlockSession,
  readVaultDevicePrefsAsync,
  readVaultUnlockSessionIfFresh,
  touchVaultUnlockSession,
  vaultUnlockSessionExceededIdle,
  type UnlockWithMasterPasswordResult,
  type VaultDevicePrefs,
  type VaultUnlockSessionFreshResult,
  type VaultUnlockSessionStorage,
  vaultIdleLockMsFromServerSeconds,
  writeVaultDevicePrefsAsync,
} from "@okkey/vault";

import { extensionLocalStorage, extensionSessionStorage } from "./extensionStorageApi";

const THEME_KEY = "okkey.theme";
const ACCENT_KEY = "okkey.accent";
const ACCENT_TINT_KEY = "okkey.accentTint";

/** Extension default idle lock: 1 hour (web/server stay on 15m). */
export const DEFAULT_EXTENSION_IDLE_LOCK_SECONDS = 3600;
export const DEFAULT_EXTENSION_IDLE_LOCK_MS = DEFAULT_EXTENSION_IDLE_LOCK_SECONDS * 1000;

/** Security defaults for new extension installs / unset device prefs. */
export const EXTENSION_DEVICE_SECURITY_DEFAULTS = {
  idleLockSeconds: DEFAULT_EXTENSION_IDLE_LOCK_SECONDS,
  lockOnDeviceSleep: DEFAULT_VAULT_DEVICE_PREFS.lockOnDeviceSleep, // true
  clipboardClearSeconds: DEFAULT_VAULT_DEVICE_PREFS.clipboardClearSeconds, // 0 = never
} as const;

function chromeSessionStorage(): VaultUnlockSessionStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      const area = extensionSessionStorage();
      if (!area) return null;
      const bag = await area.get(key);
      const value = bag[key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      const area = extensionSessionStorage();
      if (!area) return;
      await area.set({ [key]: value });
    },
    async removeItem(key: string): Promise<void> {
      const area = extensionSessionStorage();
      if (!area) return;
      await area.remove(key);
    },
  };
}

function chromeLocalKvStorage() {
  return {
    async getItem(key: string): Promise<string | null> {
      const area = extensionLocalStorage();
      if (!area) return null;
      const bag = await area.get(key);
      const value = bag[key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      const area = extensionLocalStorage();
      if (!area) return;
      await area.set({ [key]: value });
    },
  };
}

export async function persistExtensionUnlockSession(input: {
  userId: string;
  secrets: UnlockWithMasterPasswordResult;
  idleLockMs: number;
}): Promise<void> {
  await persistVaultUnlockSession(chromeSessionStorage(), {
    userId: input.userId,
    vaultKey: input.secrets.vaultKey,
    passwordShareC: input.secrets.passwordShareC,
    idleLockMs: input.idleLockMs > 0 ? input.idleLockMs : DEFAULT_EXTENSION_IDLE_LOCK_MS,
  });
}

export async function touchExtensionUnlockSession(userId: string): Promise<void> {
  await touchVaultUnlockSession(chromeSessionStorage(), userId);
}

export async function readExtensionUnlockSessionIfFresh(
  userId: string,
): Promise<VaultUnlockSessionFreshResult | null> {
  return readVaultUnlockSessionIfFresh(chromeSessionStorage(), userId);
}

export async function clearExtensionUnlockSession(): Promise<void> {
  await clearVaultUnlockSession(chromeSessionStorage());
}

/** True when session is missing, user mismatches, or idle timeout exceeded. */
export async function extensionUnlockSessionExceededIdle(userId: string): Promise<boolean> {
  return vaultUnlockSessionExceededIdle(chromeSessionStorage(), userId);
}

export async function readExtensionDevicePrefs(userId: string | null): Promise<VaultDevicePrefs> {
  return readVaultDevicePrefsAsync(userId, chromeLocalKvStorage());
}

export async function writeExtensionDevicePrefs(
  userId: string,
  prefs: VaultDevicePrefs,
): Promise<void> {
  await writeVaultDevicePrefsAsync(userId, prefs, chromeLocalKvStorage());
}

export async function readExtensionThemePreference(): Promise<{
  theme: string | null;
  accent: string | null;
  accentTint: string | null;
}> {
  const store = chromeLocalKvStorage();
  const [theme, accent, accentTint] = await Promise.all([
    store.getItem(THEME_KEY),
    store.getItem(ACCENT_KEY),
    store.getItem(ACCENT_TINT_KEY),
  ]);
  return { theme, accent, accentTint };
}

export async function writeExtensionThemePreference(input: {
  theme?: string;
  accent?: string;
  accentTint?: boolean;
}): Promise<void> {
  const store = chromeLocalKvStorage();
  if (input.theme != null) {
    await store.setItem(THEME_KEY, input.theme);
  }
  if (input.accent != null) {
    await store.setItem(ACCENT_KEY, input.accent);
  }
  if (input.accentTint !== undefined) {
    if (input.accentTint) {
      await store.setItem(ACCENT_TINT_KEY, "1");
    } else {
      const area = extensionLocalStorage();
      if (area) {
        await area.remove(ACCENT_TINT_KEY);
      }
    }
  }
}

export async function patchExtensionDevicePrefs(
  userId: string,
  patch: Partial<VaultDevicePrefs>,
): Promise<VaultDevicePrefs> {
  const next = { ...(await readExtensionDevicePrefs(userId)), ...patch };
  await writeExtensionDevicePrefs(userId, next);
  return next;
}

/**
 * Prefer saved device-local `idleLockSeconds`. When unset, seed 1h extension
 * default (does not rewrite other prefs). Server idle is not used as fallback.
 */
export async function resolveExtensionIdleLockMs(input: {
  userId: string;
  serverIdleLockSeconds?: number | null;
}): Promise<number> {
  const prefs = await readExtensionDevicePrefs(input.userId);
  if (typeof prefs.idleLockSeconds === "number" && Number.isFinite(prefs.idleLockSeconds)) {
    return vaultIdleLockMsFromServerSeconds(prefs.idleLockSeconds);
  }
  const defaultSeconds = DEFAULT_EXTENSION_IDLE_LOCK_SECONDS;
  await patchExtensionDevicePrefs(input.userId, { idleLockSeconds: defaultSeconds });
  return vaultIdleLockMsFromServerSeconds(defaultSeconds);
}

export { vaultIdleLockMsFromServerSeconds };
