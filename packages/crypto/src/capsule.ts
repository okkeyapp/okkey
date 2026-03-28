/**
 * Capsule payload crypto helpers (client-side only).
 * Wire format: 24-byte nonce || ciphertext+tag (XChaCha20-Poly1305).
 */
import initWasm, { aead_decrypt, aead_encrypt, random_bytes } from "@okkey/crypto-wasm";
import { CryptoSdkError } from "./errors.js";
import { getCryptoConfig } from "./config/index.js";

const CAPSULE_AAD = new TextEncoder().encode("okkey-capsule-payload-v1");
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
