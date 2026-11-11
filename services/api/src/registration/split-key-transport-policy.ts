/**
 * Split-key share transport.
 *
 * Share A stays 32 opaque bytes. Share B is a hybrid X25519 + ML-KEM-768
 * envelope (`hybrid_ecc_pq_v1`) framed for a device wrap key.
 * The API stores the bytes; it does not decrypt them.
 */
import { classifySplitKeyShareBWire } from "@okkey/crypto";

export type SplitKeyShareTransportMode = "hybrid_ecc_pq_v1";

/** Share-B claim: hybrid envelope only. */
export const SPLIT_KEY_SHARE_B_TRANSPORT_CLAIM = "hybrid_ecc_pq_v1" as const;

export const SPLIT_KEY_OPAQUE_SHARE_LEN = 32 as const;

/** Reject stored shares larger than a framed ML-KEM-768 envelope of a 32-byte share. */
export const SPLIT_KEY_SHARE_B_MAX_LEN = 4096 as const;

export const DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE: SplitKeyShareTransportMode =
  "hybrid_ecc_pq_v1";

const SAFE_SPLIT_KEY_SHARE_TRANSPORT_MODES = new Set<SplitKeyShareTransportMode>([
  "hybrid_ecc_pq_v1",
]);

export function normalizeSplitKeyShareTransportMode(
  value: string | undefined,
): SplitKeyShareTransportMode {
  const mode = (value ?? DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE).trim();
  if (SAFE_SPLIT_KEY_SHARE_TRANSPORT_MODES.has(mode as SplitKeyShareTransportMode)) {
    return mode as SplitKeyShareTransportMode;
  }
  throw new Error("unsupported split-key share transport; use hybrid_ecc_pq_v1");
}

/** Share-B modes this release can store. */
export function listSafeSplitKeyShareTransportModes(): readonly SplitKeyShareTransportMode[] {
  return ["hybrid_ecc_pq_v1"];
}

/**
 * Assert wire share A is exactly 32 opaque bytes.
 * Share B uses {@link assertSplitKeyShareB}.
 */
export function assertOpaqueSplitKeyShare(
  bytes: Uint8Array,
  fieldName: "server_key_share" | "device_share",
): void {
  if (bytes.length !== SPLIT_KEY_OPAQUE_SHARE_LEN) {
    throw new Error(`${fieldName} must be ${SPLIT_KEY_OPAQUE_SHARE_LEN} opaque bytes`);
  }
}

/**
 * Accept only a hybrid X25519+ML-KEM share-B frame or envelope.
 * A raw 32-byte share is rejected.
 */
export function assertSplitKeyShareB(bytes: Uint8Array): void {
  if (
    bytes.length === 0 ||
    bytes.length > SPLIT_KEY_SHARE_B_MAX_LEN ||
    classifySplitKeyShareBWire(bytes) !== "hybrid"
  ) {
    throw new Error("device_share must be a hybrid X25519+ML-KEM share envelope");
  }
}
