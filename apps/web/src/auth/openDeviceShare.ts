import { openStoredSplitKeyShareB } from "@okkey/crypto";
import { loadSplitKeyShareWrapKey } from "@okkey/vault";

import { base64ToBytes } from "./base64";

/** Open share B from a vault bundle. Legacy 32-byte shares do not need a wrap key. */
export async function openBundleDeviceShare(
  userId: string | null,
  shareB64: string,
): Promise<Uint8Array> {
  const stored = base64ToBytes(shareB64);
  const keys = userId ? await loadSplitKeyShareWrapKey(userId) : null;
  return openStoredSplitKeyShareB({
    stored,
    recipientEd25519Seed: keys?.ed25519Seed,
    recipientMlkemDecapsulationKey: keys?.mlkemDecapsulationKey,
  });
}
