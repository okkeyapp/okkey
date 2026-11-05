/**
 * AEAD wrap of the 32-byte device share under a WebAuthn PRF output.
 * The PRF output never leaves the client. The server stores only this ciphertext.
 */
import { aead_decrypt, aead_encrypt, random_bytes, sha256 } from "@okkey/crypto-wasm";
import { mapWasmError } from "./errors.js";
import { wipeBytes } from "./secret-buffer.js";
import { ensureWasm } from "./wasm-init.js";

const SHARE_LEN = 32;
const SALT_LEN = 32;
const PRF_LEN = 32;
const NONCE_LEN = 24;
const AEAD_TAG_LEN = 16;

export const PASSKEY_SHARE_WRAP_VERSION = 1;
export const PASSKEY_SHARE_WRAP_SALT_LEN = SALT_LEN;
/** version || nonce || XChaCha20-Poly1305(share). */
export const PASSKEY_SHARE_WRAP_LEN = 1 + NONCE_LEN + SHARE_LEN + AEAD_TAG_LEN;

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
  if (input.deviceShare && input.deviceShare.length !== SHARE_LEN) {
    throw new Error("device share must be 32 bytes");
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
    const out = new Uint8Array(PASSKEY_SHARE_WRAP_LEN);
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
    input.wrap.length !== PASSKEY_SHARE_WRAP_LEN ||
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
    if (share.length !== SHARE_LEN) {
      wipeBytes(share);
      throw new Error("passkey share wrap plaintext must be 32 bytes");
    }
    return share;
  } catch (error) {
    throw mapWasmError("openPasskeyShareWrap", error);
  } finally {
    wipeBytes(key);
  }
}
