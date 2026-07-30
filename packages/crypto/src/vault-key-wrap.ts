/**
 * Shared-vault key wrap/unwrap helpers (client-side only).
 *
 * Hybrid envelope (`hybrid_ecc_pq_v1`) with:
 * - ECC layer: fixed app-wide X25519 key (interim until identity stores per-user X25519)
 * - PQ layer: recipient ML-KEM-768 encapsulation key from user identity
 *
 * Security currently reduces to PQ-KEM for the recipient; replace the static ECC
 * material with per-user X25519 identity keys in a follow-up.
 */
import initWasm, {
  b64_decode,
  b64_encode,
  decrypt_hybrid,
  encrypt_hybrid,
  random_bytes,
} from "@okkey/crypto-wasm";
import type { EncryptedBlobDto } from "@okkey/types";
import { mapWasmError } from "./errors.js";

const VAULT_KEY_LEN = 32;
export const HYBRID_VAULT_KEY_WRAP_SCHEME = "hybrid_ecc_pq_v1";
export const VAULT_KEY_WRAP_AAD = new TextEncoder().encode("okkey-vault-key-wrap-v1");

/** RFC 7748 Alice X25519 keypair — interim static ECC layer for vault-key wraps. */
const INTERIM_ECC_PRIVATE = Uint8Array.from([
  0x77, 0x07, 0x6d, 0x0a, 0x73, 0x18, 0xa5, 0x7d, 0x3c, 0x16, 0xc1, 0x72, 0x51, 0xb2, 0x66, 0x45,
  0xdf, 0x4c, 0x2f, 0x87, 0xeb, 0xc0, 0x99, 0x2a, 0xb1, 0x77, 0xfb, 0xa5, 0x1d, 0xb9, 0x2c, 0x2a,
]);
const INTERIM_ECC_PUBLIC = Uint8Array.from([
  0x85, 0x20, 0xf0, 0x09, 0x89, 0x30, 0xa7, 0x54, 0x74, 0x8b, 0x7d, 0xdc, 0xb4, 0x3e, 0xf7, 0x5a,
  0x0d, 0xbf, 0x3a, 0x0d, 0x26, 0x38, 0x1a, 0xf4, 0xeb, 0xa4, 0xa9, 0x8e, 0xaa, 0x9b, 0x4e, 0x6a,
]);

let wasmReady: Promise<void> | undefined;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  await wasmReady;
}

function withWasmError<T>(op: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw mapWasmError(op, err);
  }
}

export async function generateSharedVaultKey(): Promise<Uint8Array> {
  await ensureWasm();
  return random_bytes(VAULT_KEY_LEN);
}

export type WrapVaultKeyForRecipientInput = {
  vaultKey: Uint8Array;
  recipientUserId: string;
  /** Unused by encrypt_hybrid today; reserved for future sender-bound wraps. */
  senderPrivateKey: Uint8Array;
  /** Recipient identity public key (unused while interim ECC is static). */
  recipientPublicKey: Uint8Array;
  recipientPqPublicKey: Uint8Array;
};

export async function wrapVaultKeyForRecipient(
  input: WrapVaultKeyForRecipientInput,
): Promise<EncryptedBlobDto> {
  await ensureWasm();
  if (input.vaultKey.length !== VAULT_KEY_LEN) {
    throw new Error("vaultKey must be 32 bytes");
  }
  if (input.recipientPqPublicKey.length < 32) {
    throw new Error("recipientPqPublicKey is required");
  }
  const sender =
    input.senderPrivateKey.length === 32 ? input.senderPrivateKey : INTERIM_ECC_PRIVATE;
  const envelope = withWasmError("wrapVaultKeyForRecipient", () =>
    encrypt_hybrid(
      sender,
      INTERIM_ECC_PUBLIC,
      input.recipientPqPublicKey,
      VAULT_KEY_WRAP_AAD,
      input.vaultKey,
    ),
  );
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: withWasmError("wrapVaultKeyB64", () => b64_encode(envelope)),
    meta: {
      key_wrap_scheme: HYBRID_VAULT_KEY_WRAP_SCHEME,
      entity: "vault_key_wrap",
      recipient_user_id: input.recipientUserId,
      ecc_mode: "interim_static_v1",
    },
  };
}

export type UnwrapVaultKeyInput = {
  encryptedVaultKey: EncryptedBlobDto;
  /** Recipient identity secret (unused while interim ECC is static). */
  recipientPrivateKey: Uint8Array;
  recipientPqPrivateKey: Uint8Array;
};

export async function unwrapVaultKeyForSelf(input: UnwrapVaultKeyInput): Promise<Uint8Array> {
  await ensureWasm();
  const scheme = input.encryptedVaultKey.meta?.["key_wrap_scheme"];
  if (scheme != null && scheme !== HYBRID_VAULT_KEY_WRAP_SCHEME) {
    throw new Error(`unsupported vault key wrap scheme: ${String(scheme)}`);
  }
  const envelope = withWasmError("unwrapVaultKeyB64", () =>
    b64_decode(input.encryptedVaultKey.payload),
  );
  return withWasmError("unwrapVaultKeyForSelf", () =>
    decrypt_hybrid(
      INTERIM_ECC_PRIVATE,
      input.recipientPqPrivateKey,
      VAULT_KEY_WRAP_AAD,
      envelope,
    ),
  );
}

/** Opaque event payload blob for VAULT_CREATE / access updates (server stores ciphertext only). */
export async function createOpaqueVaultEventPayload(label: string): Promise<EncryptedBlobDto> {
  await ensureWasm();
  const bytes = random_bytes(32);
  const labelBytes = new TextEncoder().encode(label);
  const payload = new Uint8Array(labelBytes.length + bytes.length);
  payload.set(labelBytes, 0);
  payload.set(bytes, labelBytes.length);
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: withWasmError("opaqueEventB64", () => b64_encode(payload)),
    meta: {
      entity: "vault_event_payload",
    },
  };
}
