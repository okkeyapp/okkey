/**
 * Encrypt/decrypt vault item event payloads with VaultKey (XChaCha20-Poly1305).
 * Wire format: 24-byte nonce || ciphertext+tag (same layout as encrypted private key in registration).
 */
import initWasm, {
  aead_decrypt,
  aead_encrypt,
  random_bytes,
} from "@okkey/crypto-wasm";

const VAULT_ITEM_AAD = new TextEncoder().encode("okkey-vault-item-payload-v1");
const NONCE_LEN = 24;

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

export async function encryptVaultItemPayload(
  vaultKey: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  await ensureWasm();
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt(
    "xchacha20-poly1305",
    vaultKey,
    nonce,
    VAULT_ITEM_AAD,
    plaintext,
  );
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export async function decryptVaultItemPayload(
  vaultKey: Uint8Array,
  blob: Uint8Array,
): Promise<Uint8Array> {
  await ensureWasm();
  if (blob.length <= NONCE_LEN) {
    throw new Error("invalid vault item ciphertext: too short");
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const ciphertext = blob.subarray(NONCE_LEN);
  return aead_decrypt(
    "xchacha20-poly1305",
    vaultKey,
    nonce,
    VAULT_ITEM_AAD,
    ciphertext,
  );
}
