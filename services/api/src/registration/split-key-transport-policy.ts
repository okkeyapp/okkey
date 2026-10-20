/**
 * Q-Day #2 / q2-6 product decision (out-of-scope):
 * Split-key A⊕B⊕C shares (incl. new-device share B) are opaque 32-byte local
 * material. They are **not** hybrid ECC+PQ KEM envelopes. PQ applies to user
 * identity keys at registration, not to share-B transport. Do not add hybrid_*
 * wrap of share B without a product override and claim-map update
 * (docs/scheme sync = q2-7).
 */

export type SplitKeyShareTransportMode = "opaque";

/** Locked claim token for this release (q2-6 out-of-scope). */
export const SPLIT_KEY_SHARE_B_TRANSPORT_CLAIM = "opaque_local_not_hybrid_kem" as const;

export const SPLIT_KEY_OPAQUE_SHARE_LEN = 32 as const;

export const DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE: SplitKeyShareTransportMode = "opaque";

const SAFE_SPLIT_KEY_SHARE_TRANSPORT_MODES = new Set<SplitKeyShareTransportMode>(["opaque"]);

/** Modes that would imply hybrid-KEM wrap of share B — always rejected. */
const REJECTED_HYBRID_SPLIT_KEY_SHARE_TRANSPORT_MODES = new Set([
  "hybrid",
  "hybrid_ecc_pq_v1",
  "hybrid_recipient",
  "hybrid_kem",
  "mlkem",
  "ml_kem",
  "ml-kem",
]);

export function normalizeSplitKeyShareTransportMode(
  value: string | undefined,
): SplitKeyShareTransportMode {
  const mode = (value ?? DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE).trim();
  if (SAFE_SPLIT_KEY_SHARE_TRANSPORT_MODES.has(mode as SplitKeyShareTransportMode)) {
    return mode as SplitKeyShareTransportMode;
  }
  if (REJECTED_HYBRID_SPLIT_KEY_SHARE_TRANSPORT_MODES.has(mode.toLowerCase())) {
    throw new Error(
      "split-key share B transport is opaque 32-byte local material, not hybrid KEM",
    );
  }
  throw new Error("unsupported split-key share transport; use opaque");
}

/** Allowed share-B transport modes for this release (q2-6 out-of-scope). */
export function listSafeSplitKeyShareTransportModes(): readonly SplitKeyShareTransportMode[] {
  return ["opaque"];
}

/**
 * Assert wire share is exactly 32 opaque bytes (rejects hybrid envelope sizes).
 * Used for server_key_share (A) and device_share (B) on register / new-device.
 */
export function assertOpaqueSplitKeyShare(
  bytes: Uint8Array,
  fieldName: "server_key_share" | "device_share",
): void {
  if (bytes.length !== SPLIT_KEY_OPAQUE_SHARE_LEN) {
    throw new Error(
      `${fieldName} must be ${SPLIT_KEY_OPAQUE_SHARE_LEN} opaque bytes (split-key share is not hybrid KEM)`,
    );
  }
}
