/**
 * Encrypt/decrypt vault item event payloads with VaultKey (XChaCha20-Poly1305).
 * Wire format: 24-byte nonce || ciphertext+tag (same layout as encrypted private key in registration).
 *
 * New writes bind `itemId` into AEAD AAD. Decrypt prefers the bound AAD, then falls back to the
 * legacy static AAD so historical ciphertext remains readable.
 *
 * Profile v1 and any non-qday profile are rejected on both read and write.
 */
import {
  aead_decrypt,
  aead_encrypt,
  random_bytes,
} from "@okkey/crypto-wasm";
import { ensureWasm } from "./wasm-init.js";
import { CryptoSdkError } from "./errors.js";
import { getCryptoConfig } from "./config/index.js";

/** Legacy AAD used before item-id binding (still accepted on decrypt). */
const VAULT_ITEM_AAD_LEGACY = new TextEncoder().encode("okkey-vault-item-payload-v1");
const VAULT_ITEM_AAD_PREFIX = "okkey-vault-item-payload-v2";
const NONCE_LEN = 24;

export type VaultItemCryptoContext = {
  itemId: string;
};

function assertVaultItemQdayProfile(
  profileVersion: number,
  direction: "read" | "write",
): void {
  const config = getCryptoConfig(profileVersion);
  if (config.runtimeMode !== "qday_default") {
    throw new CryptoSdkError(
      "UNSUPPORTED_ALGORITHM",
      `vault item ${direction} path requires qday profile, got v${config.version}`,
    );
  }
}

function encodeVaultItemAad(itemId: string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      prefix: VAULT_ITEM_AAD_PREFIX,
      itemId,
    }),
  );
}

function seal(key: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt("xchacha20-poly1305", key, nonce, aad, plaintext);
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

function open(key: Uint8Array, aad: Uint8Array, blob: Uint8Array): Uint8Array {
  if (blob.length <= NONCE_LEN) {
    throw new Error("invalid vault item ciphertext: too short");
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const ciphertext = blob.subarray(NONCE_LEN);
  return aead_decrypt("xchacha20-poly1305", key, nonce, aad, ciphertext);
}

export async function encryptVaultItemPayload(
  vaultKey: Uint8Array,
  plaintext: Uint8Array,
  profileVersion = 2,
  context?: VaultItemCryptoContext,
): Promise<Uint8Array> {
  await ensureWasm();
  assertVaultItemQdayProfile(profileVersion, "write");
  const aad = context?.itemId
    ? encodeVaultItemAad(context.itemId)
    : VAULT_ITEM_AAD_LEGACY;
  return seal(vaultKey, aad, plaintext);
}

export async function decryptVaultItemPayload(
  vaultKey: Uint8Array,
  blob: Uint8Array,
  profileVersion = 2,
  context?: { itemId?: string | null },
): Promise<Uint8Array> {
  await ensureWasm();
  assertVaultItemQdayProfile(profileVersion, "read");
  if (blob.length <= NONCE_LEN) {
    throw new Error("invalid vault item ciphertext: too short");
  }

  const itemId = context?.itemId?.trim();
  if (itemId) {
    try {
      return open(vaultKey, encodeVaultItemAad(itemId), blob);
    } catch {
      // Historical ciphertext used the static AAD — fall through.
    }
  }

  return open(vaultKey, VAULT_ITEM_AAD_LEGACY, blob);
}
