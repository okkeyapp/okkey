import { UnsupportedIdentityBundleError, wipeBytes } from "@okkey/crypto";
import { isClientUpgradeRequiredError, type CoreApiClient } from "@okkey/api";
import {
  ensureMlDsaIdentityOnUnlock,
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

export async function upgradeExtensionMlDsaIdentity(input: {
  core: CoreApiClient;
  userId: string;
  vaultKey: Uint8Array;
  bundle: StoredVaultBundle;
}): Promise<StoredVaultBundle> {
  const next = await ensureMlDsaIdentityOnUnlock({
    userId: input.userId,
    vaultKey: input.vaultKey,
    bundle: input.bundle,
    upload: async (body) => {
      await input.core.uploadMlDsaIdentityKey(body);
    },
    readLatestBundle: async () => {
      const fingerprint = await readDeviceFingerprint();
      if (!fingerprint) {
        return null;
      }
      const dto = await input.core.getVaultUnlockBootstrap(fingerprint);
      return mapVaultUnlockBootstrapToStored(dto);
    },
  });
  if (next.encrypted_private_key.payload !== input.bundle.encrypted_private_key.payload) {
    await writeExtensionVaultBundle(input.userId, next);
  }
  return next;
}

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
  } catch (error) {
    if (isClientUpgradeRequiredError(error)) {
      throw error;
    }
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
  } catch (error) {
    if (error instanceof UnsupportedIdentityBundleError || isClientUpgradeRequiredError(error)) {
      throw error;
    }
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
