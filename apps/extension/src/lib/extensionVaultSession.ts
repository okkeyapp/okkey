/**
 * Extension adapters for vault unlock session (chrome.storage.session) and
 * device prefs (chrome.storage.local). Master password is never persisted.
 */
import {
  clearVaultUnlockSession,
  DEFAULT_VAULT_IDLE_LOCK_MS,
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

const THEME_KEY = "okkey.theme";
const ACCENT_KEY = "okkey.accent";
const ACCENT_TINT_KEY = "okkey.accentTint";

function chromeSessionStorage(): VaultUnlockSessionStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      const bag = await browser.storage.session.get(key);
      const value = bag[key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      await browser.storage.session.set({ [key]: value });
    },
    async removeItem(key: string): Promise<void> {
      await browser.storage.session.remove(key);
    },
  };
}

function chromeLocalKvStorage() {
  return {
    async getItem(key: string): Promise<string | null> {
      const bag = await browser.storage.local.get(key);
      const value = bag[key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      await browser.storage.local.set({ [key]: value });
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
    idleLockMs: input.idleLockMs > 0 ? input.idleLockMs : DEFAULT_VAULT_IDLE_LOCK_MS,
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
}): Promise<void> {
  const store = chromeLocalKvStorage();
  if (input.theme != null) {
    await store.setItem(THEME_KEY, input.theme);
  }
  if (input.accent != null) {
    await store.setItem(ACCENT_KEY, input.accent);
  }
}

export { vaultIdleLockMsFromServerSeconds, DEFAULT_VAULT_IDLE_LOCK_MS };
