/**
 * ML-DSA-65 account identity: key generation, bundle upgrade material, and the
 * statement signed by the existing Ed25519 identity key when publishing the public key.
 */
import { ed25519_sign, mldsa65_keypair, mldsa65_public_key_len, mldsa65_seed_len } from "@okkey/crypto-wasm";
import type { EncryptedBlobDto } from "@okkey/types";
import { mapWasmError } from "./errors.js";
import { ensureWasm } from "./wasm-init.js";
import { wipeBytes } from "./secret-buffer.js";
import {
  MLDSA65_PUBLIC_KEY_LEN,
  MLDSA65_SEED_LEN,
  USER_IDENTITY_BUNDLE_IDENTITY_V2,
  encodeUserIdentityPrivateBundleV2,
  encryptUserIdentityPrivateBundle,
  userIdentityEncryptedBlobDtoFromPayload,
} from "./user-identity-bundle.js";

export const MLDSA_IDENTITY_UPLOAD_DOMAIN = "okkey-mldsa-identity-key-upload-v1";

const encoder = new TextEncoder();

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Canonical bytes covered by the Ed25519 identity signature on key upload. */
export function buildMlDsaIdentityUploadMessage(input: {
  userId: string;
  mldsaPublicKey: Uint8Array;
  cryptoVersion: number;
  algorithm: string;
  encryptedPrivateKeyPayload: Uint8Array;
}): Uint8Array {
  if (!input.userId) {
    throw new Error("user id is required");
  }
  if (input.mldsaPublicKey.length !== MLDSA65_PUBLIC_KEY_LEN) {
    throw new Error("invalid ml-dsa public key");
  }
  if (!Number.isInteger(input.cryptoVersion) || input.cryptoVersion < 0 || input.cryptoVersion > 0xffff_ffff) {
    throw new Error("invalid crypto version");
  }
  const version = new Uint8Array(4);
  new DataView(version.buffer).setUint32(0, input.cryptoVersion, false);
  return concatBytes([
    encoder.encode(MLDSA_IDENTITY_UPLOAD_DOMAIN),
    new Uint8Array([0]),
    encoder.encode(input.userId),
    new Uint8Array([0]),
    input.mldsaPublicKey,
    new Uint8Array([0]),
    version,
    new Uint8Array([0]),
    encoder.encode(input.algorithm),
    new Uint8Array([0]),
    input.encryptedPrivateKeyPayload,
  ]);
}

export interface PreparedMlDsaIdentityUpgrade {
  publicKey: Uint8Array;
  encryptedPrivateKey: EncryptedBlobDto;
  /** Ed25519 signature over {@link buildMlDsaIdentityUploadMessage}. */
  signature: Uint8Array;
}

/**
 * Generate an ML-DSA-65 seed, re-encrypt the identity bundle, and sign the upload statement.
 * Caller uploads the result and then replaces the stored bundle.
 */
export async function prepareMlDsaIdentityUpgrade(input: {
  vaultKey: Uint8Array;
  userId: string;
  ed25519SecretKey: Uint8Array;
  mlkem768DecapsulationKey: Uint8Array;
}): Promise<PreparedMlDsaIdentityUpgrade> {
  await ensureWasm();
  const material = mldsa65_keypair();
  const seedLen = mldsa65_seed_len();
  const publicLen = mldsa65_public_key_len();
  if (seedLen !== MLDSA65_SEED_LEN || publicLen !== MLDSA65_PUBLIC_KEY_LEN) {
    throw new Error("unexpected ml-dsa key length");
  }
  if (material.length !== seedLen + publicLen) {
    throw new Error("unexpected ml-dsa keypair output length");
  }
  const seed = material.slice(0, seedLen);
  const publicKey = material.slice(seedLen);
  const plaintext = encodeUserIdentityPrivateBundleV2(
    input.ed25519SecretKey,
    input.mlkem768DecapsulationKey,
    seed,
  );
  try {
    const encrypted = await encryptUserIdentityPrivateBundle(input.vaultKey, plaintext);
    const encryptedPrivateKey = userIdentityEncryptedBlobDtoFromPayload(encrypted, {
      identity: USER_IDENTITY_BUNDLE_IDENTITY_V2,
    });
    const message = buildMlDsaIdentityUploadMessage({
      userId: input.userId,
      mldsaPublicKey: publicKey,
      cryptoVersion: encryptedPrivateKey.crypto_version,
      algorithm: encryptedPrivateKey.algorithm,
      encryptedPrivateKeyPayload: encrypted,
    });
    const signature = mapWasmErrorOrThrow(() => ed25519_sign(input.ed25519SecretKey, message));
    return { publicKey, encryptedPrivateKey, signature };
  } finally {
    wipeBytes(material);
    wipeBytes(seed);
    wipeBytes(plaintext);
  }
}

function mapWasmErrorOrThrow<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw mapWasmError("ed25519Sign", err);
  }
}
