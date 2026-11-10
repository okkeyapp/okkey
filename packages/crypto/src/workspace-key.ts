/**
 * Versioned workspace key.
 *
 * Each member holds a hybrid wrap of the same 32-byte key (same envelope as a
 * per-recipient VaultKey wrap, with a distinct AAD that binds the key version).
 * The server stores wraps only.
 *
 * Logo and client-settings ciphertexts are XChaCha20-Poly1305 under that key.
 * Layout: uint32be key version || 24-byte nonce || ciphertext+tag.
 * The version is also bound into the AEAD AAD, so a ciphertext cannot be
 * relabeled as a newer key version.
 */
import {
  aead_decrypt,
  aead_encrypt,
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
import { ensureWasm } from "./wasm-init.js";

const WORKSPACE_KEY_LEN = 32;
const NONCE_LEN = 24;
const AEAD_TAG_LEN = 16;
export const WORKSPACE_CIPHERTEXT_VERSION_LEN = 4;

export const HYBRID_WORKSPACE_KEY_WRAP_SCHEME = "hybrid_ecc_pq_v1";
export const WORKSPACE_KEY_WRAP_ENTITY = "workspace_key_wrap";
export const WORKSPACE_KEY_WRAP_ECC_MODE = "per_user_ed25519_x25519_v1";

export type WorkspaceScopedDomain = "logo" | "client-settings";

function withWasmError<T>(op: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw mapWasmError(op, err);
  }
}

function wrapAad(keyVersion: number): Uint8Array {
  return new TextEncoder().encode(`okkey-workspace-key-wrap-v1:${keyVersion}`);
}

function domainAad(domain: WorkspaceScopedDomain, keyVersion: number): Uint8Array {
  return new TextEncoder().encode(`okkey-workspace-${domain}-v1:${keyVersion}`);
}

export function readWorkspaceCiphertextKeyVersion(ciphertext: Uint8Array): number {
  if (ciphertext.length < WORKSPACE_CIPHERTEXT_VERSION_LEN + NONCE_LEN + AEAD_TAG_LEN) {
    throw new Error("invalid workspace ciphertext: too short");
  }
  const version = new DataView(
    ciphertext.buffer,
    ciphertext.byteOffset,
    ciphertext.byteLength,
  ).getUint32(0, false);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("invalid workspace ciphertext: key version");
  }
  return version;
}

function writeVersion(target: Uint8Array, keyVersion: number): void {
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 0xffffffff) {
    throw new Error("workspace key version must be a positive integer");
  }
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(0, keyVersion, false);
}

export async function generateWorkspaceKey(): Promise<Uint8Array> {
  await ensureWasm();
  return withWasmError("generateWorkspaceKey", () => random_bytes(WORKSPACE_KEY_LEN));
}

export type WrapWorkspaceKeyInput = {
  workspaceKey: Uint8Array;
  keyVersion: number;
  recipientUserId: string;
  recipientPublicKey: Uint8Array;
  recipientPqPublicKey: Uint8Array;
};

/** Hybrid-wrap a workspace key to one member's identity public keys. */
export async function wrapWorkspaceKeyForMember(
  input: WrapWorkspaceKeyInput,
): Promise<EncryptedBlobDto> {
  await ensureWasm();
  if (input.workspaceKey.length !== WORKSPACE_KEY_LEN) {
    throw new Error("workspaceKey must be 32 bytes");
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
  const envelope = withWasmError("wrapWorkspaceKeyForMember", () =>
    encrypt_hybrid(
      new Uint8Array(32),
      recipientX25519Public,
      input.recipientPqPublicKey,
      wrapAad(input.keyVersion),
      input.workspaceKey,
    ),
  );
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: withWasmError("wrapWorkspaceKeyB64", () => b64_encode(envelope)),
    meta: {
      key_wrap_scheme: HYBRID_WORKSPACE_KEY_WRAP_SCHEME,
      entity: WORKSPACE_KEY_WRAP_ENTITY,
      recipient_user_id: input.recipientUserId,
      key_version: input.keyVersion,
      ecc_mode: WORKSPACE_KEY_WRAP_ECC_MODE,
    },
  };
}

export type UnwrapWorkspaceKeyInput = {
  encryptedWorkspaceKey: EncryptedBlobDto;
  recipientPrivateKey: Uint8Array;
  recipientPqPrivateKey: Uint8Array;
};

export async function unwrapWorkspaceKeyForSelf(
  input: UnwrapWorkspaceKeyInput,
): Promise<Uint8Array> {
  await ensureWasm();
  const meta = input.encryptedWorkspaceKey.meta;
  if (meta?.["entity"] != null && meta["entity"] !== WORKSPACE_KEY_WRAP_ENTITY) {
    throw new Error("encrypted blob is not a workspace key wrap");
  }
  if (meta?.["key_wrap_scheme"] != null && meta["key_wrap_scheme"] !== HYBRID_WORKSPACE_KEY_WRAP_SCHEME) {
    throw new Error(`unsupported workspace key wrap scheme: ${String(meta["key_wrap_scheme"])}`);
  }
  if (meta?.["ecc_mode"] !== WORKSPACE_KEY_WRAP_ECC_MODE) {
    throw new Error("unsupported workspace key wrap ecc_mode");
  }
  const keyVersion = meta?.["key_version"];
  if (typeof keyVersion !== "number" || !Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error("workspace key wrap is missing key_version");
  }
  if (input.recipientPrivateKey.length !== 32) {
    throw new Error("recipientPrivateKey (Ed25519 seed) must be 32 bytes");
  }
  const envelope = withWasmError("unwrapWorkspaceKeyB64", () =>
    b64_decode(input.encryptedWorkspaceKey.payload),
  );
  const eccPrivate = withWasmError("ed25519SecretToX25519", () =>
    ed25519_secret_to_x25519(input.recipientPrivateKey),
  );
  const workspaceKey = withWasmError("unwrapWorkspaceKeyForSelf", () =>
    decrypt_hybrid(eccPrivate, input.recipientPqPrivateKey, wrapAad(keyVersion), envelope),
  );
  if (workspaceKey.length !== WORKSPACE_KEY_LEN) {
    throw new Error("unwrapped workspace key must be 32 bytes");
  }
  return workspaceKey;
}

export async function encryptWorkspaceScopedBytes(input: {
  key: Uint8Array;
  keyVersion: number;
  domain: WorkspaceScopedDomain;
  plaintext: Uint8Array;
}): Promise<Uint8Array> {
  await ensureWasm();
  if (input.key.length !== WORKSPACE_KEY_LEN) {
    throw new Error("workspaceKey must be 32 bytes");
  }
  const nonce = withWasmError("workspaceCiphertextNonce", () => random_bytes(NONCE_LEN));
  const sealed = withWasmError("encryptWorkspaceScopedBytes", () =>
    aead_encrypt(
      "xchacha20-poly1305",
      input.key,
      nonce,
      domainAad(input.domain, input.keyVersion),
      input.plaintext,
    ),
  );
  const out = new Uint8Array(WORKSPACE_CIPHERTEXT_VERSION_LEN + nonce.length + sealed.length);
  writeVersion(out, input.keyVersion);
  out.set(nonce, WORKSPACE_CIPHERTEXT_VERSION_LEN);
  out.set(sealed, WORKSPACE_CIPHERTEXT_VERSION_LEN + nonce.length);
  return out;
}

export async function decryptWorkspaceScopedBytes(input: {
  key: Uint8Array;
  domain: WorkspaceScopedDomain;
  ciphertext: Uint8Array;
}): Promise<{ keyVersion: number; plaintext: Uint8Array }> {
  await ensureWasm();
  const keyVersion = readWorkspaceCiphertextKeyVersion(input.ciphertext);
  const nonce = input.ciphertext.subarray(
    WORKSPACE_CIPHERTEXT_VERSION_LEN,
    WORKSPACE_CIPHERTEXT_VERSION_LEN + NONCE_LEN,
  );
  const sealed = input.ciphertext.subarray(WORKSPACE_CIPHERTEXT_VERSION_LEN + NONCE_LEN);
  const plaintext = withWasmError("decryptWorkspaceScopedBytes", () =>
    aead_decrypt(
      "xchacha20-poly1305",
      input.key,
      nonce,
      domainAad(input.domain, keyVersion),
      sealed,
    ),
  );
  return { keyVersion, plaintext };
}

/**
 * Re-encrypt a workspace ciphertext with the current key version.
 * Ciphertext already at `currentVersion` is returned unchanged.
 */
export async function reencryptWorkspaceScopedBytes(input: {
  domain: WorkspaceScopedDomain;
  ciphertext: Uint8Array;
  keysByVersion: ReadonlyMap<number, Uint8Array>;
  currentVersion: number;
  currentKey: Uint8Array;
}): Promise<Uint8Array> {
  const keyVersion = readWorkspaceCiphertextKeyVersion(input.ciphertext);
  if (keyVersion === input.currentVersion) {
    return input.ciphertext;
  }
  const oldKey = input.keysByVersion.get(keyVersion);
  if (!oldKey) {
    throw new Error(`missing workspace key for version ${keyVersion}`);
  }
  const opened = await decryptWorkspaceScopedBytes({
    key: oldKey,
    domain: input.domain,
    ciphertext: input.ciphertext,
  });
  return encryptWorkspaceScopedBytes({
    key: input.currentKey,
    keyVersion: input.currentVersion,
    domain: input.domain,
    plaintext: opened.plaintext,
  });
}
