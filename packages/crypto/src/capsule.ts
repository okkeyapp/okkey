/**
 * Capsule payload crypto helpers (client-side only).
 * Wire format: 24-byte nonce || ciphertext+tag (XChaCha20-Poly1305).
 */
import initWasm, { aead_decrypt, aead_encrypt, random_bytes } from "@okkey/crypto-wasm";
import { CryptoSdkError } from "./errors.js";
import { getCryptoConfig } from "./config/index.js";

const CAPSULE_AAD = new TextEncoder().encode("okkey-capsule-payload-v1");
const CAPSULE_METADATA_AAD = new TextEncoder().encode("okkey-capsule-owner-metadata-v1");
const CAPSULE_OWNER_WRAP_AAD = new TextEncoder().encode("okkey-capsule-owner-key-wrap-v1");
const NONCE_LEN = 24;
const KEY_LEN = 32;

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

export async function generateCapsuleKey(): Promise<Uint8Array> {
  await ensureWasm();
  return random_bytes(KEY_LEN);
}

export async function encryptCapsulePayload(
  capsuleKey: Uint8Array,
  plaintext: Uint8Array,
  profileVersion = 2,
): Promise<Uint8Array> {
  await ensureWasm();
  const config = getCryptoConfig(profileVersion);
  if (config.runtimeMode !== "qday_default") {
    throw new CryptoSdkError(
      "UNSUPPORTED_ALGORITHM",
      `capsule write path requires qday profile, got v${config.version}`,
    );
  }
  if (capsuleKey.length !== KEY_LEN) {
    throw new Error("capsule key must be 32 bytes");
  }
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt(
    "xchacha20-poly1305",
    capsuleKey,
    nonce,
    CAPSULE_AAD,
    plaintext,
  );
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export async function decryptCapsulePayload(
  capsuleKey: Uint8Array,
  blob: Uint8Array,
  profileVersion = 2,
): Promise<Uint8Array> {
  await ensureWasm();
  getCryptoConfig(profileVersion);
  if (capsuleKey.length !== KEY_LEN) {
    throw new Error("capsule key must be 32 bytes");
  }
  if (blob.length <= NONCE_LEN) {
    throw new Error("invalid capsule ciphertext: too short");
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const ciphertext = blob.subarray(NONCE_LEN);
  return aead_decrypt("xchacha20-poly1305", capsuleKey, nonce, CAPSULE_AAD, ciphertext);
}

export async function encryptCapsuleMetadata(
  capsuleKey: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  return encryptWithAad(capsuleKey, plaintext, CAPSULE_METADATA_AAD);
}

export async function decryptCapsuleMetadata(
  capsuleKey: Uint8Array,
  blob: Uint8Array,
): Promise<Uint8Array> {
  return decryptWithAad(capsuleKey, blob, CAPSULE_METADATA_AAD);
}

export async function wrapCapsuleKeyForOwner(
  accountVaultKey: Uint8Array,
  capsuleKey: Uint8Array,
): Promise<Uint8Array> {
  if (capsuleKey.length !== KEY_LEN) {
    throw new Error("capsule key must be 32 bytes");
  }
  return encryptWithAad(accountVaultKey, capsuleKey, CAPSULE_OWNER_WRAP_AAD);
}

export async function unwrapCapsuleKeyForOwner(
  accountVaultKey: Uint8Array,
  wrappedKey: Uint8Array,
): Promise<Uint8Array> {
  const capsuleKey = await decryptWithAad(accountVaultKey, wrappedKey, CAPSULE_OWNER_WRAP_AAD);
  if (capsuleKey.length !== KEY_LEN) {
    capsuleKey.fill(0);
    throw new Error("invalid wrapped capsule key");
  }
  return capsuleKey;
}

/** URL-fragment-safe encoding. The returned value must never be placed in path or query. */
export function encodeCapsuleKeyFragment(capsuleKey: Uint8Array): string {
  if (capsuleKey.length !== KEY_LEN) {
    throw new Error("capsule key must be 32 bytes");
  }
  let binary = "";
  for (const byte of capsuleKey) {
    binary += String.fromCharCode(byte);
  }
  return base64Encode(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function decodeCapsuleKeyFragment(value: string): Uint8Array {
  let key: Uint8Array;
  try {
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = base64Decode(padded);
    key = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("invalid capsule key fragment");
  }
  if (key.length !== KEY_LEN) {
    key.fill(0);
    throw new Error("invalid capsule key fragment");
  }
  return key;
}

async function encryptWithAad(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  await ensureWasm();
  getCryptoConfig(2);
  if (key.length !== KEY_LEN) {
    throw new Error("encryption key must be 32 bytes");
  }
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt("xchacha20-poly1305", key, nonce, aad, plaintext);
  const result = new Uint8Array(nonce.length + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, nonce.length);
  return result;
}

async function decryptWithAad(
  key: Uint8Array,
  blob: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  await ensureWasm();
  getCryptoConfig(2);
  if (key.length !== KEY_LEN) {
    throw new Error("decryption key must be 32 bytes");
  }
  if (blob.length <= NONCE_LEN) {
    throw new Error("invalid encrypted capsule data");
  }
  return aead_decrypt(
    "xchacha20-poly1305",
    key,
    blob.subarray(0, NONCE_LEN),
    aad,
    blob.subarray(NONCE_LEN),
  );
}

function base64Encode(binary: string): string {
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return Buffer.from(binary, "binary").toString("base64");
}

function base64Decode(base64: string): string {
  if (typeof atob === "function") {
    return atob(base64);
  }
  return Buffer.from(base64, "base64").toString("binary");
}
