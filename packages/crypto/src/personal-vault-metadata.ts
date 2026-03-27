/**
 * Encrypt/decrypt per-user vault metadata (personal folders, item→folder assignments)
 * with a key derived from the user's password share **C** (32-byte Argon2id output).
 *
 * Other workspace members who share the same vault item encryption key cannot derive this key,
 * so folder names and hierarchy stay private per user while events live on the vault stream.
 *
 * Wire format matches vault item payloads: 24-byte nonce || ciphertext+tag (XChaCha20-Poly1305).
 */
import initWasm, {
  aead_decrypt,
  aead_encrypt,
  random_bytes,
  sha256,
} from "@okkey/crypto-wasm";

const PERSONAL_METADATA_AAD = new TextEncoder().encode(
  "okkey-personal-vault-metadata-payload-v1",
);
const NONCE_LEN = 24;

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

/**
 * Deterministic 32-byte key: SHA-256( C ‖ domain ‖ vaultId UTF-8 ).
 * C must be the 32-byte password share from the split-key model.
 */
export async function derivePersonalVaultMetadataKey(
  passwordShareC: Uint8Array,
  vaultId: string,
): Promise<Uint8Array> {
  await ensureWasm();
  if (passwordShareC.length !== 32) {
    throw new Error("passwordShareC must be 32 bytes");
  }
  const enc = new TextEncoder();
  const domain = enc.encode("okkey-personal-vault-metadata-key-v1|");
  const vid = enc.encode(vaultId);
  const input = new Uint8Array(32 + domain.length + vid.length);
  input.set(passwordShareC, 0);
  input.set(domain, 32);
  input.set(vid, 32 + domain.length);
  return sha256(input);
}

export async function encryptPersonalVaultMetadataPayload(
  metadataKey: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  await ensureWasm();
  const nonce = random_bytes(NONCE_LEN);
  const ciphertext = aead_encrypt(
    "xchacha20-poly1305",
    metadataKey,
    nonce,
    PERSONAL_METADATA_AAD,
    plaintext,
  );
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export async function decryptPersonalVaultMetadataPayload(
  metadataKey: Uint8Array,
  blob: Uint8Array,
): Promise<Uint8Array> {
  await ensureWasm();
  if (blob.length <= NONCE_LEN) {
    throw new Error("invalid personal vault metadata ciphertext: too short");
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const ciphertext = blob.subarray(NONCE_LEN);
  return aead_decrypt(
    "xchacha20-poly1305",
    metadataKey,
    nonce,
    PERSONAL_METADATA_AAD,
    ciphertext,
  );
}
