/**
 * Wire layout for split-key share B.
 *
 * Legacy rows are exactly 32 opaque bytes.
 * New rows are a framed hybrid envelope (X25519 + ML-KEM-768) whose header
 * matches `hybrid_ecc_pq_v1`. The frame carries the recipient Ed25519 and
 * ML-KEM encapsulation keys so another device can seal a fresh copy.
 * The envelope itself is produced by `encrypt_hybrid`.
 */

export const SPLIT_KEY_SHARE_B_LEGACY_LEN = 32;

/** ASCII "OKSB". */
export const SPLIT_KEY_SHARE_B_FRAME_MAGIC = [0x4f, 0x4b, 0x53, 0x42] as const;
export const SPLIT_KEY_SHARE_B_FRAME_VERSION = 1;

export const SPLIT_KEY_SHARE_B_ED25519_PUBLIC_LEN = 32;
export const SPLIT_KEY_SHARE_B_MLKEM_EK_LEN = 1184;

/** version || kdf || aead || reserved || x25519 pk || ml-kem ct || nonce */
export const HYBRID_ENVELOPE_FIXED_HEADER_LEN = 1148;
const HYBRID_ENVELOPE_TAG_LEN = 16;
const HYBRID_ENVELOPE_CIPHERTEXT_MAX = 128;

export const HYBRID_ENVELOPE_MIN_LEN = HYBRID_ENVELOPE_FIXED_HEADER_LEN + HYBRID_ENVELOPE_TAG_LEN;
export const HYBRID_ENVELOPE_MAX_LEN = HYBRID_ENVELOPE_FIXED_HEADER_LEN + HYBRID_ENVELOPE_CIPHERTEXT_MAX;

export const SPLIT_KEY_SHARE_B_FRAME_PREFIX_LEN =
  SPLIT_KEY_SHARE_B_FRAME_MAGIC.length +
  1 +
  SPLIT_KEY_SHARE_B_ED25519_PUBLIC_LEN +
  SPLIT_KEY_SHARE_B_MLKEM_EK_LEN;

export type SplitKeyShareBWireKind = "legacy" | "hybrid";

export type SplitKeyShareBWrapPublicKeys = {
  ed25519PublicKey: Uint8Array;
  mlkemEncapsulationKey: Uint8Array;
};

function hybridEnvelopeHeaderOk(envelope: Uint8Array): boolean {
  if (envelope.length < HYBRID_ENVELOPE_MIN_LEN || envelope.length > HYBRID_ENVELOPE_MAX_LEN) {
    return false;
  }
  return envelope[0] === 1 && envelope[1] === 1 && envelope[2] === 1 && envelope[3] === 0;
}

function magicOk(bytes: Uint8Array): boolean {
  if (bytes.length < SPLIT_KEY_SHARE_B_FRAME_MAGIC.length) {
    return false;
  }
  for (let i = 0; i < SPLIT_KEY_SHARE_B_FRAME_MAGIC.length; i += 1) {
    if (bytes[i] !== SPLIT_KEY_SHARE_B_FRAME_MAGIC[i]) {
      return false;
    }
  }
  return true;
}

export function encodeSplitKeyShareBFrame(input: {
  ed25519PublicKey: Uint8Array;
  mlkemEncapsulationKey: Uint8Array;
  envelope: Uint8Array;
}): Uint8Array {
  if (input.ed25519PublicKey.length !== SPLIT_KEY_SHARE_B_ED25519_PUBLIC_LEN) {
    throw new Error("share B recipient Ed25519 public key must be 32 bytes");
  }
  if (input.mlkemEncapsulationKey.length !== SPLIT_KEY_SHARE_B_MLKEM_EK_LEN) {
    throw new Error("share B recipient ML-KEM encapsulation key has unexpected length");
  }
  if (!hybridEnvelopeHeaderOk(input.envelope)) {
    throw new Error("share B hybrid envelope header is invalid");
  }
  const out = new Uint8Array(SPLIT_KEY_SHARE_B_FRAME_PREFIX_LEN + input.envelope.length);
  out.set(SPLIT_KEY_SHARE_B_FRAME_MAGIC, 0);
  out[SPLIT_KEY_SHARE_B_FRAME_MAGIC.length] = SPLIT_KEY_SHARE_B_FRAME_VERSION;
  let offset = SPLIT_KEY_SHARE_B_FRAME_MAGIC.length + 1;
  out.set(input.ed25519PublicKey, offset);
  offset += SPLIT_KEY_SHARE_B_ED25519_PUBLIC_LEN;
  out.set(input.mlkemEncapsulationKey, offset);
  offset += SPLIT_KEY_SHARE_B_MLKEM_EK_LEN;
  out.set(input.envelope, offset);
  return out;
}

export function splitKeyShareBEnvelope(bytes: Uint8Array): Uint8Array | null {
  if (
    bytes.length >= SPLIT_KEY_SHARE_B_FRAME_PREFIX_LEN + HYBRID_ENVELOPE_MIN_LEN &&
    magicOk(bytes) &&
    bytes[SPLIT_KEY_SHARE_B_FRAME_MAGIC.length] === SPLIT_KEY_SHARE_B_FRAME_VERSION
  ) {
    const envelope = bytes.subarray(SPLIT_KEY_SHARE_B_FRAME_PREFIX_LEN);
    return hybridEnvelopeHeaderOk(envelope) ? envelope : null;
  }
  if (hybridEnvelopeHeaderOk(bytes)) {
    return bytes;
  }
  return null;
}

export function splitKeyShareBWrapPublicKeys(bytes: Uint8Array): SplitKeyShareBWrapPublicKeys | null {
  if (
    bytes.length < SPLIT_KEY_SHARE_B_FRAME_PREFIX_LEN + HYBRID_ENVELOPE_MIN_LEN ||
    !magicOk(bytes) ||
    bytes[SPLIT_KEY_SHARE_B_FRAME_MAGIC.length] !== SPLIT_KEY_SHARE_B_FRAME_VERSION
  ) {
    return null;
  }
  const envelope = bytes.subarray(SPLIT_KEY_SHARE_B_FRAME_PREFIX_LEN);
  if (!hybridEnvelopeHeaderOk(envelope)) {
    return null;
  }
  const edStart = SPLIT_KEY_SHARE_B_FRAME_MAGIC.length + 1;
  const pqStart = edStart + SPLIT_KEY_SHARE_B_ED25519_PUBLIC_LEN;
  return {
    ed25519PublicKey: bytes.slice(edStart, pqStart),
    mlkemEncapsulationKey: bytes.slice(pqStart, pqStart + SPLIT_KEY_SHARE_B_MLKEM_EK_LEN),
  };
}

/** `legacy` is exactly 32 bytes. `hybrid` is a framed or bare envelope. */
export function classifySplitKeyShareBWire(bytes: Uint8Array): SplitKeyShareBWireKind | null {
  if (bytes.length === SPLIT_KEY_SHARE_B_LEGACY_LEN) {
    return "legacy";
  }
  return splitKeyShareBEnvelope(bytes) ? "hybrid" : null;
}
