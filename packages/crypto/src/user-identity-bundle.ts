/**
 * Hybrid user identity: Ed25519 + ML-KEM-768 private material in one AEAD-protected bundle (plaintext layout).
 * Public PQ key is stored separately (ML-KEM encapsulation key).
 */
import initWasm, {
  aead_decrypt,
  aead_encrypt,
  mlkem768_decapsulation_key_len,
  mlkem768_encapsulation_key_len,
  mlkem768_keypair,
  random_bytes,
} from "@okkey/crypto-wasm";
import type { EncryptedBlobDto } from "@okkey/types";
import { getCryptoConfig } from "./config/index.js";
import { wipeBytes } from "./secret-buffer.js";

const NONCE_LEN = 24;

const USER_IDENTITY_WRITE_CONFIG = getCryptoConfig(2);

/** Crypto profile for v2 identity artifacts (aligned with server `allowedCryptoProfileVersions`). */
export const OKKEY_CRYPTO_PROFILE_V2 = USER_IDENTITY_WRITE_CONFIG.version;

export const MLKEM768_ENCAPSULATION_KEY_LEN = 1184;
export const MLKEM768_DECAPSULATION_KEY_LEN = 2400;

const BUNDLE_VERSION_V1 = 1;

/** Plaintext: version || ed25519_sk (32) || mlkem768_dk */
export const USER_IDENTITY_PRIVATE_BUNDLE_V1_LEN =
  1 + 32 + MLKEM768_DECAPSULATION_KEY_LEN;

/** Minimum `EncryptedBlob.payload` (base64-decoded) size: nonce + AEAD( bundle ). */
export const USER_IDENTITY_ENCRYPTED_PRIVATE_MIN_PAYLOAD_BYTES =
  NONCE_LEN + USER_IDENTITY_PRIVATE_BUNDLE_V1_LEN + 16;

export const USER_IDENTITY_SK_AAD = new TextEncoder().encode("okkey-user-identity-sk-v2");

/** Browser-safe base64 (no Node `Buffer`; used on the registration / unlock web path). */
function uint8ToStandardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function standardBase64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i) & 0xff;
  }
  return out;
}

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

export function encodeUserIdentityPrivateBundleV1(
  ed25519SecretKey32: Uint8Array,
  mlkem768DecapsulationKey: Uint8Array,
): Uint8Array {
  if (ed25519SecretKey32.length !== 32) {
    throw new Error("ed25519 secret key must be 32 bytes");
  }
  if (mlkem768DecapsulationKey.length !== MLKEM768_DECAPSULATION_KEY_LEN) {
    throw new Error(`mlkem768 decapsulation key must be ${MLKEM768_DECAPSULATION_KEY_LEN} bytes`);
  }
  const out = new Uint8Array(USER_IDENTITY_PRIVATE_BUNDLE_V1_LEN);
  out[0] = BUNDLE_VERSION_V1;
  out.set(ed25519SecretKey32, 1);
  out.set(mlkem768DecapsulationKey, 33);
  return out;
}

export function decodeUserIdentityPrivateBundleV1(plaintext: Uint8Array): {
  ed25519SecretKey: Uint8Array;
  mlkem768DecapsulationKey: Uint8Array;
} {
  if (plaintext.length !== USER_IDENTITY_PRIVATE_BUNDLE_V1_LEN) {
    throw new Error("invalid user identity bundle plaintext length");
  }
  if (plaintext[0] !== BUNDLE_VERSION_V1) {
    throw new Error("unsupported user identity bundle version");
  }
  return {
    ed25519SecretKey: plaintext.slice(1, 33),
    mlkem768DecapsulationKey: plaintext.slice(33),
  };
}

/** Random ML-KEM-768 keypair; returns `[decapsulation_key || encapsulation_key]`. */
export async function generateMlkem768KeypairMaterial(): Promise<{
  decapsulationKey: Uint8Array;
  encapsulationKey: Uint8Array;
}> {
  await ensureWasm();
  const dkLen = mlkem768_decapsulation_key_len();
  const ekLen = mlkem768_encapsulation_key_len();
  const both = mlkem768_keypair();
  if (both.length !== dkLen + ekLen) {
    throw new Error("unexpected mlkem768_keypair output length");
  }
  try {
    return {
      decapsulationKey: both.slice(0, dkLen),
      encapsulationKey: both.slice(dkLen),
    };
  } finally {
    // best-effort cleanup for concatenated keypair material buffer
    wipeBytes(both);
  }
}

export async function encryptUserIdentityPrivateBundle(
  vaultKey: Uint8Array,
  plaintextBundle: Uint8Array,
): Promise<Uint8Array> {
  await ensureWasm();
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt(
    "xchacha20-poly1305",
    vaultKey,
    nonce,
    USER_IDENTITY_SK_AAD,
    plaintextBundle,
  );
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export async function decryptUserIdentityPrivateBundle(
  vaultKey: Uint8Array,
  blobBytes: Uint8Array,
): Promise<{
  ed25519SecretKey: Uint8Array;
  mlkem768DecapsulationKey: Uint8Array;
}> {
  await ensureWasm();
  if (blobBytes.length <= NONCE_LEN) {
    throw new Error("encrypted user identity bundle too short");
  }
  const nonce = blobBytes.subarray(0, NONCE_LEN);
  const ciphertext = blobBytes.subarray(NONCE_LEN);
  const plaintext = aead_decrypt(
    "xchacha20-poly1305",
    vaultKey,
    nonce,
    USER_IDENTITY_SK_AAD,
    ciphertext,
  );
  try {
    return decodeUserIdentityPrivateBundleV1(plaintext);
  } finally {
    // decoded secret keys are copied out; wipe intermediate plaintext bundle bytes
    wipeBytes(plaintext);
  }
}

export function userIdentityEncryptedBlobDtoFromPayload(payloadBytes: Uint8Array): EncryptedBlobDto {
  return {
    crypto_version: OKKEY_CRYPTO_PROFILE_V2,
    algorithm: USER_IDENTITY_WRITE_CONFIG.encryptedBlobAlgorithm,
    payload: uint8ToStandardBase64(payloadBytes),
    meta: {
      entity: "user_private_key_bundle",
      bundle_version: 2,
      identity: "ed25519_mlkem768_v1",
      key_scope: "account",
    },
  };
}

/** Unlock path: decrypt `EncryptedBlob` wire payload after VaultKey is recovered from split-key. */
export async function decryptUserIdentityFromEncryptedBlob(
  vaultKey: Uint8Array,
  encryptedPayloadBase64: string,
): Promise<{
  ed25519SecretKey: Uint8Array;
  mlkem768DecapsulationKey: Uint8Array;
}> {
  await ensureWasm();
  const blobBytes = standardBase64ToUint8(encryptedPayloadBase64);
  try {
    return await decryptUserIdentityPrivateBundle(vaultKey, blobBytes);
  } finally {
    wipeBytes(blobBytes);
  }
}
