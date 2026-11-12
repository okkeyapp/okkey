import { timingSafeEqual } from "node:crypto";
import { splitKeyShareBWrapPublicKeys } from "@okkey/crypto";

export const APPROVAL_SHARE_MUST_BE_NEW = "share envelope must be new for the pending device";
export const APPROVAL_SHARE_WRONG_RECIPIENT =
  "share envelope is not addressed to the pending device";

export type ApprovalShareRejection = "reused" | "recipient";

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * A direct approval share must be a new framed envelope for the pending
 * device. The frame already carries that device's wrap public keys.
 */
export function matchesStoredShare(
  submitted: Uint8Array,
  storedShares: readonly Uint8Array[],
): boolean {
  return storedShares.some((existing) => sameBytes(existing, submitted));
}

export function approvalShareRejection(
  submitted: Uint8Array,
  pendingStored: Uint8Array | null,
  storedShares: readonly Uint8Array[],
): ApprovalShareRejection | null {
  if (matchesStoredShare(submitted, storedShares)) {
    return "reused";
  }
  if (pendingStored && sameBytes(pendingStored, submitted)) {
    return "reused";
  }
  const expected = pendingStored ? splitKeyShareBWrapPublicKeys(pendingStored) : null;
  const actual = splitKeyShareBWrapPublicKeys(submitted);
  if (
    !expected ||
    !actual ||
    !sameBytes(expected.ed25519PublicKey, actual.ed25519PublicKey) ||
    !sameBytes(expected.mlkemEncapsulationKey, actual.mlkemEncapsulationKey)
  ) {
    return "recipient";
  }
  return null;
}
