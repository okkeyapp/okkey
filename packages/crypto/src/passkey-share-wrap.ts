/**
 * AEAD wrap of device share B under a WebAuthn PRF output.
 * Share B is the hybrid frame the unlocked client already holds.
 * The PRF output never leaves the client. The server stores only this ciphertext.
 */
import { aead_decrypt, aead_encrypt, random_bytes, sha256 } from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";
import { wipeBytes } from "./secret-buffer.js";
import { ensureWasm } from "./wasm-init.js";

const SALT_LEN = 32;
const PRF_LEN = 32;
const NONCE_LEN = 24;
const AEAD_TAG_LEN = 16;
/** Same ceiling as the API share-B transport (`SPLIT_KEY_SHARE_B_MAX_LEN`). */
const SHARE_MAX_LEN = 4096;

export const PASSKEY_SHARE_WRAP_VERSION = 1;
export const PASSKEY_SHARE_WRAP_SALT_LEN = SALT_LEN;
/** version || nonce || AEAD tag, before the share plaintext. */
export const PASSKEY_SHARE_WRAP_OVERHEAD = 1 + NONCE_LEN + AEAD_TAG_LEN;
export const PASSKEY_SHARE_WRAP_MAX_LEN = PASSKEY_SHARE_WRAP_OVERHEAD + SHARE_MAX_LEN;

const KEY_DOMAIN = new TextEncoder().encode("okkey-passkey-share-wrap-key-v1\n");

function wrapAad(credentialId: string): Uint8Array {
  return new TextEncoder().encode(`okkey-passkey-share-wrap-v1\n${credentialId}`);
}

function deriveWrapKey(prfOutput: Uint8Array, salt: Uint8Array): Uint8Array {
  const payload = new Uint8Array(KEY_DOMAIN.length + prfOutput.length + salt.length);
  payload.set(KEY_DOMAIN, 0);
  payload.set(prfOutput, KEY_DOMAIN.length);
  payload.set(salt, KEY_DOMAIN.length + prfOutput.length);
  try {
    return sha256(payload);
  } finally {
    wipeBytes(payload);
  }
}

function assertInputs(input: {
  deviceShare?: Uint8Array;
  prfOutput: Uint8Array;
  salt: Uint8Array;
  credentialId: string;
}): void {
  if (
    input.deviceShare &&
    (input.deviceShare.length === 0 || input.deviceShare.length > SHARE_MAX_LEN)
  ) {
    throw new Error("device share length is outside the passkey wrap limit");
  }
  if (input.prfOutput.length !== PRF_LEN) {
    throw new Error("PRF output must be 32 bytes");
  }
  if (input.salt.length !== SALT_LEN) {
    throw new Error("passkey share wrap salt must be 32 bytes");
  }
  if (!input.credentialId.trim()) {
    throw new Error("credential id is required");
  }
}

export async function sealPasskeyShareWrap(input: {
  deviceShare: Uint8Array;
  prfOutput: Uint8Array;
  salt: Uint8Array;
  /** WebAuthn credential id. Binds the ciphertext to that credential. */
  credentialId: string;
}): Promise<Uint8Array> {
  await ensureWasm();
  assertInputs(input);
  const shareCopy = input.deviceShare.slice();
  const key = deriveWrapKey(input.prfOutput, input.salt);
  const nonce = random_bytes(NONCE_LEN);
  try {
    const ciphertext = aead_encrypt(
      "xchacha20-poly1305",
      key,
      nonce,
      wrapAad(input.credentialId),
      shareCopy,
    );
    const out = new Uint8Array(PASSKEY_SHARE_WRAP_OVERHEAD + shareCopy.length);
    out[0] = PASSKEY_SHARE_WRAP_VERSION;
    out.set(nonce, 1);
    out.set(ciphertext, 1 + NONCE_LEN);
    return out;
  } catch (error) {
    throw mapWasmError("sealPasskeyShareWrap", error);
  } finally {
    wipeBytes(shareCopy);
    wipeBytes(key);
    wipeBytes(nonce);
  }
}

export async function openPasskeyShareWrap(input: {
  wrap: Uint8Array;
  prfOutput: Uint8Array;
  salt: Uint8Array;
  credentialId: string;
}): Promise<Uint8Array> {
  await ensureWasm();
  assertInputs({ ...input, deviceShare: undefined });
  if (
    input.wrap.length < PASSKEY_SHARE_WRAP_OVERHEAD ||
    input.wrap.length > PASSKEY_SHARE_WRAP_MAX_LEN ||
    input.wrap[0] !== PASSKEY_SHARE_WRAP_VERSION
  ) {
    throw new Error("passkey share wrap is malformed");
  }
  const key = deriveWrapKey(input.prfOutput, input.salt);
  try {
    const share = aead_decrypt(
      "xchacha20-poly1305",
      key,
      input.wrap.slice(1, 1 + NONCE_LEN),
      wrapAad(input.credentialId),
      input.wrap.slice(1 + NONCE_LEN),
    );
    if (share.length === 0 || share.length > SHARE_MAX_LEN) {
      wipeBytes(share);
      throw new Error("passkey share wrap plaintext length is invalid");
    }
    return share;
  } catch (error) {
    throw mapWasmError("openPasskeyShareWrap", error);
  } finally {
    wipeBytes(key);
  }
}
