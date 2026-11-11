/**
 * Resolve server share A for master-password unlock.
 * Prefer the in-memory copy, then a post-auth fetch, then a legacy disk copy.
 * Disk is rewritten without A only after a server copy is committed for this page.
 */
import {
  acquireServerKeyShare,
  type AcquiredServerKeyShare,
  deviceShareRewriteB64,
  mapVaultUnlockBootstrapToStored,
  mergeDeviceShareFromServer,
} from "@okkey/vault";

import { isClientUpgradeRequiredError } from "@okkey/api";

import { createAuthenticatedCoreClient } from "../api/client";
import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";
import { registerCurrentBrowserDevice } from "./deviceTrust";
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
            const client = createAuthenticatedCoreClient(input.accessToken!);
            const dto = await client.getVaultUnlockBootstrap(getOrCreateDeviceFingerprint());
            const merged = mergeDeviceShareFromServer({
              localShareB64: input.bundle.device_share_b64,
              serverShareB64: dto.device_share,
            });
            let deviceShareB64 = merged?.deviceShareB64 ?? input.bundle.device_share_b64;
            if (merged?.rewrite) {
              try {
                const uploaded = await deviceShareRewriteB64({
                  userId: input.userId,
                  localShareB64: deviceShareB64,
                });
                if (uploaded) {
                  deviceShareB64 = uploaded;
                  writeVaultBundle(
                    { ...input.bundle, device_share_b64: uploaded },
                    input.userId,
                  );
                  await registerCurrentBrowserDevice(client, undefined, { userId: input.userId });
                }
              } catch {
                /* Unlock still uses the local share when the upload cannot run. */
              }
            }
            fetchedBundle = {
              ...mapVaultUnlockBootstrapToStored(dto),
              device_share_b64: deviceShareB64,
            };
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
