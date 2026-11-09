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
 * Share bytes to store on the pending device during approval.
 * Returns undefined when the server can keep its existing copy (legacy 32-byte
 * share on both sides). A pending device that published wrap public keys
 * receives a new hybrid envelope. A legacy peer of a hybrid approver receives
 * the raw 32-byte share so it can still unlock.
 */
export async function replacementDeviceShareForApproval(input: {
  userId: string;
  localShareB64: string;
  pending: Pick<
    DeviceListItemDto,
    "share_wrap_ed25519_public_key" | "share_wrap_pq_public_key"
  >;
}): Promise<string | undefined> {
  const stored = base64ToBytes(input.localShareB64);
  const kind = classifySplitKeyShareBWire(stored);
  if (!kind) {
    throw new Error("invalid local share B");
  }
  const pendingEd = input.pending.share_wrap_ed25519_public_key?.trim() ?? "";
  const pendingPq = input.pending.share_wrap_pq_public_key?.trim() ?? "";
  const pendingHasWrapKeys = pendingEd.length > 0 && pendingPq.length > 0;

  if (!pendingHasWrapKeys && kind === "legacy") {
    return undefined;
  }

  const keys = await loadSplitKeyShareWrapKey(input.userId);
  const raw = await openStoredSplitKeyShareB({
    stored,
    recipientEd25519Seed: keys?.ed25519Seed,
    recipientMlkemDecapsulationKey: keys?.mlkemDecapsulationKey,
  });
  try {
    if (!pendingHasWrapKeys) {
      return bytesToBase64(raw);
    }
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
