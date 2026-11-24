import { UnsupportedIdentityBundleError, wipeBytes } from "@okkey/crypto";
import { isClientUpgradeRequiredError, type CoreApiClient } from "@okkey/api";
import {
  deviceShareRewriteB64,
  ensureMlDsaIdentityOnUnlock,
  loadSplitKeyShareWrapKey,
  mergeDeviceShareFromServer,
} from "@okkey/vault";
import {
  unlockWithMasterPassword,
  type UnlockWithMasterPasswordResult,
} from "@okkey/vault/unlock-with-master-password";
import {
  mapVaultUnlockBootstrapToStored,
  type StoredVaultBundle,
} from "@okkey/vault/vault-bundle";

import { initExtensionCrypto } from "./initExtensionCrypto.ts";
import { readDeviceFingerprint } from "./storage.ts";
import { writeExtensionVaultBundle } from "./vaultStorage.ts";
import {
  ensureExtensionVaultBundle,
  type ExtensionMasterPasswordUnlockResult,
} from "./extensionVaultBundle.ts";

export type { ExtensionMasterPasswordUnlockResult };
export { clearExtensionServerKeyShareMemory, ensureExtensionVaultBundle } from "./extensionVaultBundle.ts";

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
      const mapped = mapVaultUnlockBootstrapToStored(dto);
      const merged = mergeDeviceShareFromServer({
        localShareB64: input.bundle.device_share_b64,
        serverShareB64: dto.device_share,
      });
      return {
        ...mapped,
        device_share_b64: merged?.deviceShareB64 || input.bundle.device_share_b64,
      };
    },
  });
  if (next.encrypted_private_key.payload !== input.bundle.encrypted_private_key.payload) {
    await writeExtensionVaultBundle(input.userId, next);
  }
  return next;
}

export function rewriteExtensionClearedDeviceShare(
  core: CoreApiClient,
  userId: string,
): (localShareB64: string) => Promise<string | null> {
  return async (localShareB64) => {
    const uploaded = await deviceShareRewriteB64({
      userId,
      localShareB64,
    });
    if (!uploaded) {
      return null;
    }
    const { registerExtensionDevice } = await import("./deviceTrust.ts");
    await registerExtensionDevice(core, {
      userId,
      existingShareB64: uploaded,
    });
    return uploaded;
  };
}

export async function unlockExtensionVault(input: {
  core: CoreApiClient;
  userId: string;
  masterPassword: string;
}): Promise<ExtensionMasterPasswordUnlockResult> {
  await initExtensionCrypto();
  const bundle = await ensureExtensionVaultBundle({
    core: input.core,
    userId: input.userId,
    rewriteClearedDeviceShare: rewriteExtensionClearedDeviceShare(input.core, input.userId),
  });
  if (!bundle) {
    return { ok: false, reason: "no_bundle" };
  }
  if (!bundle.server_key_share_b64?.trim()) {
    return { ok: false, reason: "server_share_unavailable" };
  }
  try {
    const shareWrap = await loadSplitKeyShareWrapKey(input.userId);
    const secrets = await unlockWithMasterPassword(bundle, input.masterPassword, shareWrap);
    return { ok: true, secrets };
  } catch (error) {
    if (error instanceof UnsupportedIdentityBundleError || isClientUpgradeRequiredError(error)) {
      throw error;
    }
    if (error instanceof Error && error.message === "SERVER_KEY_SHARE_UNAVAILABLE") {
      return { ok: false, reason: "server_share_unavailable" };
    }
    return { ok: false, reason: "rejected" };
  }
}

export function wipeUnlockSecrets(secrets: UnlockWithMasterPasswordResult | null): void {
  if (!secrets) {
    return;
  }
  wipeBytes(secrets.vaultKey);
  wipeBytes(secrets.passwordShareC);
}
