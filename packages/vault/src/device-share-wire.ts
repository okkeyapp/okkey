/**
 * Bytes sent as `device_share`.
 * New writes are a framed hybrid envelope. A legacy 32-byte share is upgraded
 * in place when a device wrap key can be stored for this user.
 */
import {
  classifySplitKeyShareBWire,
  randomSplitKeyShare,
  sealSplitKeyShareB,
  wipeBytes,
  wrapSplitKeyShareB,
} from "@okkey/crypto";

import { bytesToBase64, base64ToBytes } from "./base64.js";
import {
  loadSplitKeyShareWrapKey,
  persistSplitKeyShareWrapKey,
} from "./split-key-share-wrap-store.js";

export async function deviceShareB64ForRegister(input: {
  userId: string;
  existingShareB64?: string | null;
}): Promise<{ shareB64: string; upgradedShareB64: string | null }> {
  const userId = input.userId.trim();
  if (!userId) {
    throw new Error("userId is required to seal share B");
  }
  const existing = input.existingShareB64?.trim()
    ? base64ToBytes(input.existingShareB64.trim())
    : null;
  if (existing && classifySplitKeyShareBWire(existing) === "hybrid") {
    return { shareB64: bytesToBase64(existing), upgradedShareB64: null };
  }

  const legacy = existing && classifySplitKeyShareBWire(existing) === "legacy" ? existing : null;
  const raw = legacy ?? (await randomSplitKeyShare());
  const minted = legacy == null;
  try {
    const stored = await loadSplitKeyShareWrapKey(userId);
    if (stored && legacy) {
      const wrapped = await wrapSplitKeyShareB({
        share: legacy,
        recipientEd25519PublicKey: stored.ed25519PublicKey,
        recipientMlkemEncapsulationKey: stored.mlkemEncapsulationKey,
      });
      return { shareB64: bytesToBase64(wrapped), upgradedShareB64: bytesToBase64(wrapped) };
    }
    const sealed = await sealSplitKeyShareB(raw);
    try {
      await persistSplitKeyShareWrapKey(userId, sealed.shareWrap);
    } finally {
      wipeBytes(sealed.shareWrap.ed25519Seed);
      wipeBytes(sealed.shareWrap.mlkemDecapsulationKey);
    }
    const shareB64 = bytesToBase64(sealed.wrapped);
    return { shareB64, upgradedShareB64: minted ? null : shareB64 };
  } finally {
    if (minted) {
      wipeBytes(raw);
    }
  }
}
