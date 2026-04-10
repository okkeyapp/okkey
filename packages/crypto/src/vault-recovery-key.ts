/**
 * Wrap the 32-byte account `VaultKey` with a high-entropy recovery secret (UTF-8 bytes).
 * Used by Enterprise recovery flows; wire format is a versioned `EncryptedBlob`.
 */
import initWasm, { aead_decrypt, aead_encrypt, kdf_derive, random_bytes } from "@okkey/crypto-wasm";
import type { EncryptedBlobDto } from "@okkey/types";
import { getCryptoConfig } from "./config/index.js";
import { OKKEY_PASSWORD_KDF_PARAMS_V1 } from "./registration.js";
import { wipeBytes } from "./secret-buffer.js";

const NONCE_LEN = 24;
const VAULT_KEY_LEN = 32;
const KDF_SALT_LEN = 16;

/** Fixed salt for Argon2id(recovery_secret) → wrap key (not the per-user password KDF salt). */
const RECOVERY_SECRET_KDF_SALT = new TextEncoder().encode("okkey-recovery-v1").subarray(0, KDF_SALT_LEN);
if (RECOVERY_SECRET_KDF_SALT.length !== KDF_SALT_LEN) {
  throw new Error("recovery kdf salt must be 16 bytes");
}

const RECOVERY_WRAP_AAD = new TextEncoder().encode("okkey-vault-recovery-wrap-v1");

const RECOVERY_WRITE_CONFIG = getCryptoConfig(2);

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

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

function deriveRecoveryWrapKey(recoverySecretUtf8: Uint8Array): Uint8Array {
  return kdf_derive(
    recoverySecretUtf8,
    RECOVERY_SECRET_KDF_SALT,
    OKKEY_PASSWORD_KDF_PARAMS_V1.mCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.tCost,
    OKKEY_PASSWORD_KDF_PARAMS_V1.pCost,
    VAULT_KEY_LEN,
  );
}

/** AEAD-encrypt `vaultKey` under a key derived from `recoverySecretUtf8`. */
export async function wrapVaultKeyWithRecoverySecret(
  vaultKey: Uint8Array,
  recoverySecretUtf8: Uint8Array,
): Promise<EncryptedBlobDto> {
  await ensureWasm();
  if (vaultKey.length !== VAULT_KEY_LEN) {
    throw new Error("vaultKey must be 32 bytes");
  }
  const wrapKey = deriveRecoveryWrapKey(recoverySecretUtf8);
  try {
    const nonce = random_bytes(NONCE_LEN);
    const ciphertext = aead_encrypt("xchacha20-poly1305", wrapKey, nonce, RECOVERY_WRAP_AAD, vaultKey);
    const payload = new Uint8Array(nonce.length + ciphertext.length);
    payload.set(nonce, 0);
    payload.set(ciphertext, nonce.length);
    return {
      crypto_version: RECOVERY_WRITE_CONFIG.version,
      algorithm: RECOVERY_WRITE_CONFIG.encryptedBlobAlgorithm,
      payload: uint8ToStandardBase64(payload),
      meta: {
        entity: "vault_key_recovery_wrap",
        key_scope: "account",
      },
    };
  } finally {
    wipeBytes(wrapKey);
  }
}

/** Decrypt a blob produced by {@link wrapVaultKeyWithRecoverySecret}. */
export async function unwrapVaultKeyWithRecoverySecret(
  recoverySecretUtf8: Uint8Array,
  dto: EncryptedBlobDto,
): Promise<Uint8Array> {
  await ensureWasm();
  const wrapKey = deriveRecoveryWrapKey(recoverySecretUtf8);
  const blobBytes = standardBase64ToUint8(dto.payload);
  try {
    if (blobBytes.length <= NONCE_LEN) {
      throw new Error("recovery wrap payload too short");
    }
    const nonce = blobBytes.subarray(0, NONCE_LEN);
    const ciphertext = blobBytes.subarray(NONCE_LEN);
    const vaultKey = aead_decrypt("xchacha20-poly1305", wrapKey, nonce, RECOVERY_WRAP_AAD, ciphertext);
    if (vaultKey.length !== VAULT_KEY_LEN) {
      wipeBytes(vaultKey);
      throw new Error("unexpected vault key length");
    }
    return vaultKey;
  } finally {
    wipeBytes(wrapKey);
    wipeBytes(blobBytes);
  }
}
