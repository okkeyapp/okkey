/** Extension-local vault bundle + workspace preference on chrome.storage.local. */

import {
  mapVaultUnlockBootstrapToStored,
  omitServerKeyShare,
  parseStoredVaultBundle,
  type StoredVaultBundle,
} from "@okkey/vault/vault-bundle";
import {
  markLockOnDeviceSleepDefaultForNewInstall,
  type VaultDevicePrefsStorage,
} from "@okkey/vault/vault-device-prefs";

import { extensionLocalStorage } from "./extensionStorageApi.ts";

const KEYS = {
  vaultBundlePrefix: "okkey.extension.vaultBundle.u.",
  currentWorkspacePrefix: "okkey.extension.workspace.current.u.",
} as const;

/** chrome.storage.local key for the per-user extension vault bundle. */
export function extensionVaultBundleStorageKey(userId: string): string {
  return `${KEYS.vaultBundlePrefix}${userId}`;
}

function extensionLocalKv(): VaultDevicePrefsStorage {
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

function storageArea() {
  const area = extensionLocalStorage();
  if (!area) {
    throw new Error("extension storage is unavailable");
  }
  return area;
}

export async function readExtensionVaultBundle(userId: string): Promise<StoredVaultBundle | null> {
  const key = extensionVaultBundleStorageKey(userId);
  const result = await storageArea().get(key);
  return parseStoredVaultBundle(result[key]);
}

export async function writeExtensionVaultBundle(
  userId: string,
  bundle: StoredVaultBundle,
): Promise<void> {
  const key = extensionVaultBundleStorageKey(userId);
  const area = storageArea();
  const existing = await area.get(key);
  if (existing[key] == null) {
    await markLockOnDeviceSleepDefaultForNewInstall(userId, extensionLocalKv());
  }
  await area.set({ [key]: omitServerKeyShare(bundle) });
}

export async function clearExtensionVaultBundle(userId: string): Promise<void> {
  await storageArea().remove(extensionVaultBundleStorageKey(userId));
}

export { mapVaultUnlockBootstrapToStored };

export async function readStoredCurrentWorkspaceId(userId: string): Promise<string | null> {
  const key = `${KEYS.currentWorkspacePrefix}${userId}`;
  const result = await storageArea().get(key);
  const raw = result[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function writeStoredCurrentWorkspaceId(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const key = `${KEYS.currentWorkspacePrefix}${userId}`;
  await storageArea().set({ [key]: workspaceId });
}
