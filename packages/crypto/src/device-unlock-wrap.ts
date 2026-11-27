/**
 * Wrap vault unlock material (VaultKey + password share C) for PIN / biometric device unlock.
 * Secrets never leave the client. PIN wrap keys are Argon2id-derived; biometric wrap keys
 * are derived from WebAuthn PRF output (never persisted).
 */
import { aead_decrypt, aead_encrypt, kdf_derive, random_bytes, sha256 } from "@okkey/crypto-wasm";
import { ensureWasm } from "./wasm-init.js";
import { OKKEY_PASSWORD_KDF_PARAMS_V1 } from "./registration.js";
import { wipeBytes } from "./secret-buffer.js";

const NONCE_LEN = 24;
const SHARE_LEN = 32;
const KDF_SALT_LEN = 16;
const BIO_PRF_SALT_LEN = 32;
const UNLOCK_BLOB_VERSION = 1;

const PIN_WRAP_AAD = new TextEncoder().encode("okkey-device-unlock-pin-wrap-v1");
const BIO_WRAP_AAD = new TextEncoder().encode("okkey-device-unlock-bio-wrap-v1");
/** Domain separation for PRF → bio wrap key (fixed context string). */
const BIO_WRAP_KEY_DOMAIN = new TextEncoder().encode("okkey-device-unlock-bio-wrap-key-v1\n");

export const DEVICE_BIO_PRF_SALT_LEN = BIO_PRF_SALT_LEN;


function encodeUnlockPlaintext(vaultKey: Uint8Array, passwordShareC: Uint8Array): Uint8Array {
  if (vaultKey.length !== SHARE_LEN || passwordShareC.length !== SHARE_LEN) {
    throw new Error("vaultKey and passwordShareC must be 32 bytes");
  }
  const out = new Uint8Array(1 + SHARE_LEN + SHARE_LEN);
  out[0] = UNLOCK_BLOB_VERSION;
  out.set(vaultKey, 1);
  out.set(passwordShareC, 1 + SHARE_LEN);
  return out;
}

function decodeUnlockPlaintext(plaintext: Uint8Array): {
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
} {
  if (plaintext.length !== 1 + SHARE_LEN + SHARE_LEN || plaintext[0] !== UNLOCK_BLOB_VERSION) {
    throw new Error("invalid device unlock blob");
  }
  return {
    vaultKey: plaintext.slice(1, 1 + SHARE_LEN),
    passwordShareC: plaintext.slice(1 + SHARE_LEN),
  };
}

function seal(wrapKey: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt("xchacha20-poly1305", wrapKey, nonce, aad, plaintext);
  const payload = new Uint8Array(nonce.length + ciphertext.length);
  payload.set(nonce, 0);
  payload.set(ciphertext, nonce.length);
  return payload;
}

function open(wrapKey: Uint8Array, aad: Uint8Array, payload: Uint8Array): Uint8Array {
  if (payload.length <= NONCE_LEN) {
    throw new Error("invalid device unlock ciphertext");
  }
  const nonce = payload.slice(0, NONCE_LEN);
  const ciphertext = payload.slice(NONCE_LEN);
  return aead_decrypt("xchacha20-poly1305", wrapKey, nonce, aad, ciphertext);
}

export type PinUnlockWrap = {
  kdfSaltB64: string;
  ciphertextB64: string;
};

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i) & 0xff;
  }
  return out;
}

function derivePinWrapKey(pinUtf8: Uint8Array, salt: Uint8Array): Uint8Array {
  return kdf_derive(
    pinUtf8,
    salt,
    OKKEY_PASSWORD_KDF_PARAMS_V1.mCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.tCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.pCost,
    SHARE_LEN,
  );
}

export async function wrapUnlockMaterialWithPin(input: {
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
  pinUtf8: Uint8Array;
}): Promise<PinUnlockWrap> {
  await ensureWasm();
  const salt = random_bytes(KDF_SALT_LEN);
  const wrapKey = derivePinWrapKey(input.pinUtf8, salt);
  const plaintext = encodeUnlockPlaintext(input.vaultKey, input.passwordShareC);
  try {
    const ciphertext = seal(wrapKey, PIN_WRAP_AAD, plaintext);
    return {
      kdfSaltB64: bytesToB64(salt),
      ciphertextB64: bytesToB64(ciphertext),
    };
  } finally {
    wipeBytes(wrapKey);
    wipeBytes(plaintext);
    wipeBytes(salt);
  }
}

export async function unwrapUnlockMaterialWithPin(input: {
  wrap: PinUnlockWrap;
  pinUtf8: Uint8Array;
}): Promise<{ vaultKey: Uint8Array; passwordShareC: Uint8Array }> {
  await ensureWasm();
  const salt = b64ToBytes(input.wrap.kdfSaltB64);
  const ciphertext = b64ToBytes(input.wrap.ciphertextB64);
  const wrapKey = derivePinWrapKey(input.pinUtf8, salt);
  try {
    const plaintext = open(wrapKey, PIN_WRAP_AAD, ciphertext);
    try {
      return decodeUnlockPlaintext(plaintext);
    } finally {
      wipeBytes(plaintext);
    }
  } finally {
    wipeBytes(wrapKey);
    wipeBytes(salt);
    wipeBytes(ciphertext);
  }
}

/**
 * Derive the biometric wrap key from WebAuthn PRF output and the stored PRF eval salt.
 * Domain-separated SHA-256 (fixed context || prf || salt). Caller must wipe the result.
 */
export async function deriveBioWrapKeyFromPrf(input: {
  prfOutput: Uint8Array;
  salt: Uint8Array;
}): Promise<Uint8Array> {
  await ensureWasm();
  if (input.prfOutput.length !== SHARE_LEN) {
    throw new Error("PRF output must be 32 bytes");
  }
  if (input.salt.length !== BIO_PRF_SALT_LEN) {
    throw new Error("bio PRF salt must be 32 bytes");
  }
  const payload = new Uint8Array(
    BIO_WRAP_KEY_DOMAIN.length + input.prfOutput.length + input.salt.length,
  );
  payload.set(BIO_WRAP_KEY_DOMAIN, 0);
  payload.set(input.prfOutput, BIO_WRAP_KEY_DOMAIN.length);
  payload.set(input.salt, BIO_WRAP_KEY_DOMAIN.length + input.prfOutput.length);
  try {
    return sha256(payload);
  } finally {
    wipeBytes(payload);
  }
}

/** Random salt used as WebAuthn PRF `eval.first` input (stored; wrap key is not). */
export async function generateBioPrfSalt(): Promise<Uint8Array> {
  await ensureWasm();
  return random_bytes(BIO_PRF_SALT_LEN);
}

/** Wrap under a 32-byte key derived from WebAuthn PRF (never persist the key). */
export async function wrapUnlockMaterialWithBioKey(input: {
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
  bioWrapKey: Uint8Array;
}): Promise<string> {
  await ensureWasm();
  if (input.bioWrapKey.length !== SHARE_LEN) {
    throw new Error("bioWrapKey must be 32 bytes");
  }
  const plaintext = encodeUnlockPlaintext(input.vaultKey, input.passwordShareC);
  try {
    return bytesToB64(seal(input.bioWrapKey, BIO_WRAP_AAD, plaintext));
  } finally {
    wipeBytes(plaintext);
  }
}

export async function unwrapUnlockMaterialWithBioKey(input: {
  ciphertextB64: string;
  bioWrapKey: Uint8Array;
}): Promise<{ vaultKey: Uint8Array; passwordShareC: Uint8Array }> {
  await ensureWasm();
  if (input.bioWrapKey.length !== SHARE_LEN) {
    throw new Error("bioWrapKey must be 32 bytes");
  }
  const ciphertext = b64ToBytes(input.ciphertextB64);
  try {
    const plaintext = open(input.bioWrapKey, BIO_WRAP_AAD, ciphertext);
    try {
      return decodeUnlockPlaintext(plaintext);
    } finally {
      wipeBytes(plaintext);
    }
  } finally {
    wipeBytes(ciphertext);
  }
}

/** @deprecated Prefer deriveBioWrapKeyFromPrf; kept for pin/bio AEAD unit tests. */
export async function generateDeviceBioWrapKey(): Promise<Uint8Array> {
  await ensureWasm();
  return random_bytes(SHARE_LEN);
}
