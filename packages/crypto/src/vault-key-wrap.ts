/**
 * Shared-vault key wrap/unwrap helpers (client-side only).
 *
 * Hybrid envelope (`hybrid_ecc_pq_v1`) with:
 * - ECC layer: per-user X25519 derived from recipient Ed25519 identity
 *   (`ed25519_public_to_x25519` / `ed25519_secret_to_x25519`, libsodium-compatible)
 * - PQ layer: recipient ML-KEM-768 encapsulation key from user identity
 *
 * Legacy wraps with `meta.ecc_mode = "interim_static_v1"` still unwrap via the
 * interim RFC7748 Alice keypair. New wraps never use that path.
 */
import initWasm, {
  b64_decode,
  b64_encode,
  decrypt_hybrid,
  ed25519_public_to_x25519,
  ed25519_secret_to_x25519,
  encrypt_hybrid,
  random_bytes,
} from "@okkey/crypto-wasm";
import type { EncryptedBlobDto } from "@okkey/types";
import { mapWasmError } from "./errors.js";

const VAULT_KEY_LEN = 32;
export const HYBRID_VAULT_KEY_WRAP_SCHEME = "hybrid_ecc_pq_v1";
export const VAULT_KEY_WRAP_AAD = new TextEncoder().encode("okkey-vault-key-wrap-v1");

/** New wraps: ECC leg bound to recipient Ed25519→X25519 identity. */
export const PER_USER_ECC_MODE = "per_user_ed25519_x25519_v1" as const;
/** Legacy wraps written before per-user ECC (unwrap-only). */
export const INTERIM_STATIC_ECC_MODE = "interim_static_v1" as const;

/** RFC 7748 Alice X25519 keypair — unwrap-only for legacy `interim_static_v1` wraps. */
const INTERIM_ECC_PRIVATE = Uint8Array.from([
  0x77, 0x07, 0x6d, 0x0a, 0x73, 0x18, 0xa5, 0x7d, 0x3c, 0x16, 0xc1, 0x72, 0x51, 0xb2, 0x66, 0x45,
  0xdf, 0x4c, 0x2f, 0x87, 0xeb, 0xc0, 0x99, 0x2a, 0xb1, 0x77, 0xfb, 0xa5, 0x1d, 0xb9, 0x2c, 0x2a,
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
  /** Unused by encrypt_hybrid (ephemeral sender); reserved for sender-bound wraps. */
  senderPrivateKey: Uint8Array;
  /** Recipient Ed25519 verifying key (`users.public_key`). Converted to X25519 for ECDH. */
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
  if (input.recipientPublicKey.length !== 32) {
    throw new Error("recipientPublicKey (Ed25519) must be 32 bytes");
  }
  if (input.recipientPqPublicKey.length < 32) {
    throw new Error("recipientPqPublicKey is required");
  }
  const recipientX25519Public = withWasmError("ed25519PublicToX25519", () =>
    ed25519_public_to_x25519(input.recipientPublicKey),
  );
  // encrypt_hybrid ignores sender private and generates an ephemeral X25519.
  const senderPlaceholder =
    input.senderPrivateKey.length === 32 ? input.senderPrivateKey : new Uint8Array(32);
  const envelope = withWasmError("wrapVaultKeyForRecipient", () =>
    encrypt_hybrid(
      senderPlaceholder,
      recipientX25519Public,
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
      ecc_mode: PER_USER_ECC_MODE,
    },
  };
}

export type UnwrapVaultKeyInput = {
  encryptedVaultKey: EncryptedBlobDto;
  /** Recipient Ed25519 SigningKey seed (converted to X25519 for per-user wraps). */
  recipientPrivateKey: Uint8Array;
  recipientPqPrivateKey: Uint8Array;
};

function resolveEccUnwrapPrivate(input: UnwrapVaultKeyInput): Uint8Array {
  const mode = input.encryptedVaultKey.meta?.["ecc_mode"];
  if (mode === INTERIM_STATIC_ECC_MODE || mode == null) {
    // Missing ecc_mode: treat as legacy interim (pre-meta wraps).
    return INTERIM_ECC_PRIVATE;
  }
  if (mode !== PER_USER_ECC_MODE) {
    throw new Error(`unsupported vault key wrap ecc_mode: ${String(mode)}`);
  }
  if (input.recipientPrivateKey.length !== 32) {
    throw new Error("recipientPrivateKey (Ed25519 seed) must be 32 bytes");
  }
  return withWasmError("ed25519SecretToX25519", () =>
    ed25519_secret_to_x25519(input.recipientPrivateKey),
  );
}

export async function unwrapVaultKeyForSelf(input: UnwrapVaultKeyInput): Promise<Uint8Array> {
  await ensureWasm();
  const scheme = input.encryptedVaultKey.meta?.["key_wrap_scheme"];
  if (scheme != null && scheme !== HYBRID_VAULT_KEY_WRAP_SCHEME) {
    throw new Error(`unsupported vault key wrap scheme: ${String(scheme)}`);
  }
  const envelope = withWasmError("unwrapVaultKeyB64", () =>
    b64_decode(input.encryptedVaultKey.payload),
  );
  const eccPrivate = resolveEccUnwrapPrivate(input);
  return withWasmError("unwrapVaultKeyForSelf", () =>
    decrypt_hybrid(
      eccPrivate,
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
