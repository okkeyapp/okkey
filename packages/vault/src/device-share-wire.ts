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

/**
 * Wire form of a share opened from a one-time delivery envelope.
 * The database stores only a hybrid envelope addressed to this device's wrap key.
 */
export async function envelopeB64ForPlaintextShare(input: {
  userId: string;
  share: Uint8Array;
}): Promise<string> {
  const userId = input.userId.trim();
  if (!userId) {
    throw new Error("userId is required to seal share B");
  }
  if (classifySplitKeyShareBWire(input.share) === "hybrid") {
    return bytesToBase64(input.share);
  }
  const stored = await loadSplitKeyShareWrapKey(userId);
  if (stored) {
    try {
      const wrapped = await wrapSplitKeyShareB({
        share: input.share,
        recipientEd25519PublicKey: stored.ed25519PublicKey,
        recipientMlkemEncapsulationKey: stored.mlkemEncapsulationKey,
      });
      return bytesToBase64(wrapped);
    } finally {
      wipeBytes(stored.ed25519Seed);
      wipeBytes(stored.mlkemDecapsulationKey);
    }
  }
  const sealed = await sealSplitKeyShareB(input.share);
  try {
    await persistSplitKeyShareWrapKey(userId, sealed.shareWrap);
  } finally {
    wipeBytes(sealed.shareWrap.ed25519Seed);
    wipeBytes(sealed.shareWrap.mlkemDecapsulationKey);
  }
  return bytesToBase64(sealed.wrapped);
}

function shareKind(shareB64: string | null | undefined): "hybrid" | "legacy" | null {
  const trimmed = shareB64?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  try {
    const kind = classifySplitKeyShareBWire(base64ToBytes(trimmed));
    return kind === "hybrid" || kind === "legacy" ? kind : null;
  } catch {
    return null;
  }
}

/**
 * Keep a local share when the server copy was cleared or is still raw.
 * `rewrite` means the client should upload an envelope. A missing local share
 * is not replaced with a newly minted one.
 */
export function mergeDeviceShareFromServer(input: {
  localShareB64?: string | null;
  serverShareB64?: string | null;
}): { deviceShareB64: string; rewrite: boolean } | null {
  const serverKind = shareKind(input.serverShareB64);
  if (serverKind === "hybrid") {
    return { deviceShareB64: input.serverShareB64!.trim(), rewrite: false };
  }
  const local = input.localShareB64?.trim() ?? "";
  const localKind = shareKind(local);
  if (localKind !== "legacy" && localKind !== "hybrid") {
    return null;
  }
  return { deviceShareB64: local, rewrite: true };
}

/**
 * Envelope to upload for a cleared server share.
 * Returns null when the local bytes are not a legacy share or an envelope,
 * so a missing share is never replaced with a new random term.
 */
export async function deviceShareRewriteB64(input: {
  userId: string;
  localShareB64: string;
}): Promise<string | null> {
  const kind = shareKind(input.localShareB64);
  if (kind === "hybrid") {
    return input.localShareB64.trim();
  }
  if (kind !== "legacy") {
    return null;
  }
  const wire = await deviceShareB64ForRegister({
    userId: input.userId,
    existingShareB64: input.localShareB64,
  });
  return wire.shareB64;
}

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
