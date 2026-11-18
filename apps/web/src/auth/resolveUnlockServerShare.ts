/**
 * Resolve server share A for master-password unlock.
 * Prefer the in-memory copy, then a post-auth fetch, then a legacy disk copy.
 * Disk is rewritten without A only after a server copy is committed for this page.
 *
 * Device share B is always refreshed from unlock-bootstrap when online, even if A
 * is already cached. A stale local placeholder hybrid must not win after approval.
 */
import {
  acquireServerKeyShare,
  type AcquiredServerKeyShare,
  deviceShareRewriteB64,
  mapVaultUnlockBootstrapToStored,
  mergeDeviceShareFromServer,
  rememberServerKeyShare,
} from "@okkey/vault";

import { isClientUpgradeRequiredError } from "@okkey/api";

import { createAuthenticatedCoreClient } from "../api/client";
import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";
import { registerCurrentBrowserDevice } from "./deviceTrust";
import { readVaultBundle, writeVaultBundle, type StoredVaultBundle } from "./localVaultBundle";

async function applyBootstrapDeviceShare(input: {
  userId: string;
  accessToken: string;
  bundle: StoredVaultBundle;
}): Promise<StoredVaultBundle> {
  const client = createAuthenticatedCoreClient(input.accessToken);
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
        writeVaultBundle({ ...input.bundle, device_share_b64: uploaded }, input.userId);
        await registerCurrentBrowserDevice(client, undefined, { userId: input.userId });
      }
    } catch {
      /* Unlock still uses the best available share when the upload cannot run. */
    }
  }
  const next: StoredVaultBundle = {
    ...mapVaultUnlockBootstrapToStored(dto),
    device_share_b64: deviceShareB64,
  };
  writeVaultBundle(next, input.userId);
  rememberServerKeyShare(input.userId, dto.server_key_share);
  return next;
}

export async function resolveUnlockServerShare(input: {
  userId: string;
  accessToken: string | null;
  bundle: StoredVaultBundle;
}): Promise<AcquiredServerKeyShare | null> {
  let upgradeRequired: unknown;

  // Online unlock always refreshes B from the server first. Cached A alone used
  // to skip this path and leave a pre-approval placeholder hybrid on disk.
  if (input.accessToken) {
    try {
      const refreshed = await applyBootstrapDeviceShare({
        userId: input.userId,
        accessToken: input.accessToken,
        bundle: input.bundle,
      });
      const share = refreshed.server_key_share_b64?.trim() || null;
      if (share) {
        return { shareB64: share, source: "server" };
      }
    } catch (error) {
      if (isClientUpgradeRequiredError(error)) {
        upgradeRequired = error;
      }
      /* Fall through to memory / legacy when bootstrap cannot run. */
    }
  }

  if (upgradeRequired) {
    throw upgradeRequired;
  }

  const acquired = await acquireServerKeyShare({
    userId: input.userId,
    legacyShareB64: input.bundle.server_key_share_b64,
    fetchFromServer: undefined,
  });

  if (!acquired) {
    return null;
  }

  if (acquired.source === "memory" && input.bundle.server_key_share_b64) {
    const latest = readVaultBundle(input.userId) ?? input.bundle;
    writeVaultBundle(latest, input.userId);
  }

  return acquired;
}
