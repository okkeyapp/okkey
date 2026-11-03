import { wipeBytes } from "@okkey/crypto";
import type { CoreApiClient } from "@okkey/api";
import {
  unlockWithMasterPassword,
  type StoredVaultBundle,
  type UnlockWithMasterPasswordResult,
} from "@okkey/vault";

import { initExtensionCrypto } from "./initExtensionCrypto";
import { readDeviceFingerprint } from "./storage";
import {
  mapVaultUnlockBootstrapToStored,
  readExtensionVaultBundle,
  writeExtensionVaultBundle,
} from "./vaultStorage";

export async function ensureExtensionVaultBundle(input: {
  core: CoreApiClient;
  userId: string;
}): Promise<StoredVaultBundle | null> {
  const existing = await readExtensionVaultBundle(input.userId);
  if (existing) {
    return existing;
  }
  const fingerprint = await readDeviceFingerprint();
  if (!fingerprint) {
    return null;
  }
  try {
    const dto = await input.core.getVaultUnlockBootstrap(fingerprint);
    const bundle = mapVaultUnlockBootstrapToStored(dto);
    await writeExtensionVaultBundle(input.userId, bundle);
    return bundle;
  } catch {
    return null;
  }
}

export async function unlockExtensionVault(input: {
  core: CoreApiClient;
  userId: string;
  masterPassword: string;
}): Promise<UnlockWithMasterPasswordResult | null> {
  await initExtensionCrypto();
  const bundle = await ensureExtensionVaultBundle({
    core: input.core,
    userId: input.userId,
  });
  if (!bundle) {
    return null;
  }
  try {
    return await unlockWithMasterPassword(bundle, input.masterPassword);
  } catch {
    return null;
  }
}

export function wipeUnlockSecrets(secrets: UnlockWithMasterPasswordResult | null): void {
  if (!secrets) {
    return;
  }
  wipeBytes(secrets.vaultKey);
  wipeBytes(secrets.passwordShareC);
}
