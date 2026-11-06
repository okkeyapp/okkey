import { isClientUpgradeRequiredError, type CoreApiClient } from "@okkey/api";
import {
  acquireServerKeyShare,
  clearRememberedServerKeyShares,
} from "@okkey/vault/server-key-share-memory";
import {
  mapVaultUnlockBootstrapToStored,
  type StoredVaultBundle,
} from "@okkey/vault/vault-bundle";
import type { UnlockWithMasterPasswordResult } from "@okkey/vault/unlock-with-master-password";

import { readDeviceFingerprint } from "./storage.ts";
import { readExtensionVaultBundle, writeExtensionVaultBundle } from "./vaultStorage.ts";

export type ExtensionMasterPasswordUnlockResult =
  | { ok: true; secrets: UnlockWithMasterPasswordResult }
  | { ok: false; reason: "no_bundle" | "server_share_unavailable" | "rejected" };

/** Popup and service worker are separate realms; each holds its own in-memory share. */
export function clearExtensionServerKeyShareMemory(): void {
  clearRememberedServerKeyShares();
}

/**
 * Device material stays in chrome.storage.local. The server share is attached only
 * on the returned object (memory): fetched after auth, or a legacy copy still on disk.
 */
export async function ensureExtensionVaultBundle(input: {
  core: CoreApiClient;
  userId: string;
}): Promise<StoredVaultBundle | null> {
  const existing = await readExtensionVaultBundle(input.userId);
  let fetched: StoredVaultBundle | null = null;
  let upgradeRequired: unknown;
  const acquired = await acquireServerKeyShare({
    userId: input.userId,
    legacyShareB64: existing?.server_key_share_b64,
    fetchFromServer: async () => {
      const fingerprint = await readDeviceFingerprint();
      if (!fingerprint) {
        return null;
      }
      try {
        const dto = await input.core.getVaultUnlockBootstrap(fingerprint);
        fetched = mapVaultUnlockBootstrapToStored(dto);
        return dto.server_key_share;
      } catch (error) {
        if (isClientUpgradeRequiredError(error)) {
          upgradeRequired = error;
        }
        throw error;
      }
    },
  });
  if (upgradeRequired) {
    throw upgradeRequired;
  }

  if (acquired?.source === "server") {
    const fresh: StoredVaultBundle | null = fetched;
    if (!fresh) {
      return null;
    }
    await writeExtensionVaultBundle(input.userId, fresh);
    return { ...fresh, server_key_share_b64: acquired.shareB64 };
  }

  if (!existing) {
    return null;
  }

  if (acquired?.source === "memory" && existing.server_key_share_b64) {
    await writeExtensionVaultBundle(input.userId, existing);
  }

  if (!acquired) {
    return existing;
  }

  return { ...existing, server_key_share_b64: acquired.shareB64 };
}
