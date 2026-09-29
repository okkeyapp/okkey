/** Extension-local vault bundle + workspace preference on chrome.storage.local. */

import {
  mapVaultUnlockBootstrapToStored,
  parseStoredVaultBundle,
  type StoredVaultBundle,
} from "@okkey/vault";

const KEYS = {
  vaultBundlePrefix: "okkey.extension.vaultBundle.u.",
  currentWorkspacePrefix: "okkey.extension.workspace.current.u.",
} as const;

function storageArea(): typeof browser.storage.local {
  return browser.storage.local;
}

export async function readExtensionVaultBundle(userId: string): Promise<StoredVaultBundle | null> {
  const key = `${KEYS.vaultBundlePrefix}${userId}`;
  const result = await storageArea().get(key);
  return parseStoredVaultBundle(result[key]);
}

export async function writeExtensionVaultBundle(
  userId: string,
  bundle: StoredVaultBundle,
): Promise<void> {
  const key = `${KEYS.vaultBundlePrefix}${userId}`;
  await storageArea().set({ [key]: bundle });
}

export async function clearExtensionVaultBundle(userId: string): Promise<void> {
  await storageArea().remove(`${KEYS.vaultBundlePrefix}${userId}`);
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
