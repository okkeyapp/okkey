/** Wire header shared with `@okkey/crypto` workspace ciphertext: uint32be key version. */
export const WORKSPACE_CIPHERTEXT_VERSION_LEN = 4;
const NONCE_LEN = 24;
const AEAD_TAG_LEN = 16;

export function readWorkspaceCiphertextKeyVersion(ciphertext: Uint8Array): number {
  if (ciphertext.length < WORKSPACE_CIPHERTEXT_VERSION_LEN + NONCE_LEN + AEAD_TAG_LEN) {
    throw new Error("invalid workspace ciphertext: too short");
  }
  const version = new DataView(
    ciphertext.buffer,
    ciphertext.byteOffset,
    ciphertext.byteLength,
  ).getUint32(0, false);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("invalid workspace ciphertext: key version");
  }
  return version;
}
