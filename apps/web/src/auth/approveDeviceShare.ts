import {
  classifySplitKeyShareBWire,
  openStoredSplitKeyShareB,
  wipeBytes,
  wrapSplitKeyShareB,
} from "@okkey/crypto";
import type { DeviceListItemDto } from "@okkey/types";
import { loadSplitKeyShareWrapKey } from "@okkey/vault";

import { base64ToBytes, bytesToBase64 } from "./base64";

/**
 * Hybrid share envelope to store for a pending device during approval.
 * The pending device must already have published wrap public keys.
 * Without those keys approval cannot continue.
 */
export async function replacementDeviceShareForApproval(input: {
  userId: string;
  localShareB64: string;
  pending: Pick<
    DeviceListItemDto,
    "share_wrap_ed25519_public_key" | "share_wrap_pq_public_key"
  >;
}): Promise<string> {
  const pendingEd = input.pending.share_wrap_ed25519_public_key?.trim() ?? "";
  const pendingPq = input.pending.share_wrap_pq_public_key?.trim() ?? "";
  if (!pendingEd || !pendingPq) {
    throw new Error("pending device has no share wrap keys");
  }

  const stored = base64ToBytes(input.localShareB64);
  const kind = classifySplitKeyShareBWire(stored);
  if (!kind) {
    throw new Error("invalid local share B");
  }

  const keys = await loadSplitKeyShareWrapKey(input.userId);
  const raw = await openStoredSplitKeyShareB({
    stored,
    recipientEd25519Seed: keys?.ed25519Seed,
    recipientMlkemDecapsulationKey: keys?.mlkemDecapsulationKey,
  });
  try {
    const wrapped = await wrapSplitKeyShareB({
      share: raw,
      recipientEd25519PublicKey: base64ToBytes(pendingEd),
      recipientMlkemEncapsulationKey: base64ToBytes(pendingPq),
    });
    return bytesToBase64(wrapped);
  } finally {
    wipeBytes(raw);
  }
}
