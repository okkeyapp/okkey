import { isClientUpgradeRequiredError, type CoreApiClient } from "@okkey/api";
import {
  acquireServerKeyShare,
  clearRememberedServerKeyShares,
} from "@okkey/vault/server-key-share-memory";
import { mergeDeviceShareFromServer } from "@okkey/vault/device-share-wire";
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
  /** Upload an envelope when the server share was cleared. */
  rewriteClearedDeviceShare?: (localShareB64: string) => Promise<string | null>;
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
        const mapped = mapVaultUnlockBootstrapToStored(dto);
        const merged = mergeDeviceShareFromServer({
          localShareB64: existing?.device_share_b64,
          serverShareB64: dto.device_share,
        });
        let deviceShareB64 = merged?.deviceShareB64 ?? mapped.device_share_b64;
        if (merged?.rewrite && input.rewriteClearedDeviceShare) {
          try {
            const uploaded = await input.rewriteClearedDeviceShare(deviceShareB64);
            if (uploaded?.trim()) {
              deviceShareB64 = uploaded.trim();
            }
          } catch {
            /* Unlock keeps the local share when the upload cannot run. */
          }
        }
        if (deviceShareB64.trim()) {
          fetched = { ...mapped, device_share_b64: deviceShareB64 };
        }
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
    const fresh = fetched ?? existing;
    if (!fresh) {
      return null;
    }
    if (fetched) {
      await writeExtensionVaultBundle(input.userId, fetched);
    }
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
