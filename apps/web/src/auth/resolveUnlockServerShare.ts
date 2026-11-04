/**
 * Resolve server share A for master-password unlock.
 * Prefer the in-memory copy, then a post-auth fetch, then a legacy disk copy.
 * Disk is rewritten without A only after a server copy is committed for this page.
 */
import {
  acquireServerKeyShare,
  type AcquiredServerKeyShare,
  mapVaultUnlockBootstrapToStored,
} from "@okkey/vault";

import { isClientUpgradeRequiredError } from "@okkey/api";

import { createAuthenticatedCoreClient } from "../api/client";
import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";
import { readVaultBundle, writeVaultBundle, type StoredVaultBundle } from "./localVaultBundle";

export async function resolveUnlockServerShare(input: {
  userId: string;
  accessToken: string | null;
  bundle: StoredVaultBundle;
}): Promise<AcquiredServerKeyShare | null> {
  let fetchedBundle: StoredVaultBundle | null = null;
  let upgradeRequired: unknown;
  const acquired = await acquireServerKeyShare({
    userId: input.userId,
    legacyShareB64: input.bundle.server_key_share_b64,
    fetchFromServer: input.accessToken
      ? async () => {
          try {
            const dto = await createAuthenticatedCoreClient(input.accessToken!).getVaultUnlockBootstrap(
              getOrCreateDeviceFingerprint(),
            );
            fetchedBundle = mapVaultUnlockBootstrapToStored(dto);
            return dto.server_key_share;
          } catch (error) {
            if (isClientUpgradeRequiredError(error)) {
              upgradeRequired = error;
            }
            throw error;
          }
        }
      : undefined,
  });
  if (upgradeRequired) {
    throw upgradeRequired;
  }

  if (!acquired) {
    return null;
  }

  if (acquired.source === "server" && fetchedBundle) {
    writeVaultBundle(fetchedBundle, input.userId);
    return acquired;
  }

  if (acquired.source === "memory" && input.bundle.server_key_share_b64) {
    const latest = readVaultBundle(input.userId) ?? input.bundle;
    writeVaultBundle(latest, input.userId);
  }

  return acquired;
}
