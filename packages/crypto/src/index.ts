import initWasm, {
  random_bytes,
  kdf_derive,
  aead_encrypt,
  aead_decrypt,
  ed25519_keypair,
  ed25519_sign,
  ed25519_verify,
  hybrid_sign_v1,
  hybrid_verify_v1,
  x25519_keypair,
  x25519_shared,
  b64_encode,
  b64_decode,
  sha256,
  generate_pq_keys,
  hybrid_envelope_fixed_header_len,
  hybrid_envelope_version,
  hybrid_envelope_kdf_id,
  hybrid_envelope_aead_id,
  hybrid_envelope_ecc_public_key_len,
  hybrid_envelope_pq_ciphertext_len,
  hybrid_envelope_nonce_len,
  encrypt_hybrid,
  decrypt_hybrid,
} from "@okkey/crypto-wasm";
import { CryptoSdkError, mapWasmError } from "./errors.js";
import {
  decodeHybridEnvelopeV1,
  encodeHybridEnvelopeV1,
  type HybridEnvelopeConfig,
  type HybridEnvelopeView,
} from "./hybrid-envelope.js";

export type AeadAlg = "aes-256-gcm" | "xchacha20-poly1305";

let wasmReady: Promise<void> | undefined;

export async function initCrypto(moduleOrPath?: unknown): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(
      moduleOrPath as Parameters<typeof initWasm>[0],
    ).then(() => undefined);
  }
  return wasmReady;
}

function withWasmError<T>(op: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw mapWasmError(op, err);
  }
}

export function randomBytes(len: number): Uint8Array {
  return withWasmError("randomBytes", () => random_bytes(len));
}

export function kdfDerive(password: Uint8Array, salt: Uint8Array, params: { mCost: number; tCost: number; pCost: number }, outLen: number): Uint8Array {
  return withWasmError("kdfDerive", () => kdf_derive(password, salt, params.mCost, params.tCost, params.pCost, outLen));
}

export function aeadEncrypt(alg: AeadAlg, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return withWasmError("aeadEncrypt", () => aead_encrypt(alg, key, nonce, aad, plaintext));
}

export function aeadDecrypt(alg: AeadAlg, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return withWasmError("aeadDecrypt", () => aead_decrypt(alg, key, nonce, aad, ciphertext));
}

export function ed25519Keypair(): Uint8Array {
  return withWasmError("ed25519Keypair", () => ed25519_keypair());
}

export function ed25519Sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return withWasmError("ed25519Sign", () => ed25519_sign(privateKey, message));
}

export function ed25519Verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  return withWasmError("ed25519Verify", () => ed25519_verify(publicKey, message, signature));
}

export function hybridSignV1(
  privateKey: Uint8Array,
  signerPqPublicKey: Uint8Array,
  context: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  return withWasmError("hybridSignV1", () =>
    hybrid_sign_v1(privateKey, signerPqPublicKey, context, message));
}

export function hybridVerifyV1(
  publicKey: Uint8Array,
  signerPqPublicKey: Uint8Array,
  context: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  return withWasmError("hybridVerifyV1", () =>
    hybrid_verify_v1(publicKey, signerPqPublicKey, context, message, signature));
}

export function x25519Keypair(): Uint8Array {
  return withWasmError("x25519Keypair", () => x25519_keypair());
}

export function x25519Shared(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  return withWasmError("x25519Shared", () => x25519_shared(privateKey, peerPublicKey));
}

export function b64Encode(data: Uint8Array): string {
  return b64_encode(data);
}

export function b64Decode(s: string): Uint8Array {
  return withWasmError("b64Decode", () => b64_decode(s));
}

export function sha256Digest(data: Uint8Array): Uint8Array {
  return sha256(data);
}

export function generatePQKeys(): Uint8Array {
  return withWasmError("generatePQKeys", () => generate_pq_keys());
}

export function hybridEnvelopeFixedHeaderLen(): number {
  return withWasmError("hybridEnvelopeFixedHeaderLen", () => hybrid_envelope_fixed_header_len());
}

export function getHybridEnvelopeConfig(): HybridEnvelopeConfig {
  return withWasmError("getHybridEnvelopeConfig", () => ({
    version: hybrid_envelope_version(),
    kdfId: hybrid_envelope_kdf_id(),
    aeadId: hybrid_envelope_aead_id(),
    eccPublicKeyLen: hybrid_envelope_ecc_public_key_len(),
    pqCiphertextLen: hybrid_envelope_pq_ciphertext_len(),
    nonceLen: hybrid_envelope_nonce_len(),
    fixedHeaderLen: hybrid_envelope_fixed_header_len(),
  }));
}

export function decodeHybridEnvelope(
  envelope: Uint8Array,
): HybridEnvelopeView {
  return decodeHybridEnvelopeV1(envelope, getHybridEnvelopeConfig());
}

export function encodeHybridEnvelope(parts: {
  header: {
    version: number;
    kdfId: number;
    aeadId: number;
    reserved: number;
  };
  eccEphemeralPublicKey: Uint8Array;
  pqCiphertext: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}): Uint8Array {
  return encodeHybridEnvelopeV1(parts, getHybridEnvelopeConfig());
}

export function encryptHybrid(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPqPublicKey: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  return withWasmError("encryptHybrid", () =>
    encrypt_hybrid(senderPrivateKey, recipientPublicKey, recipientPqPublicKey, aad, plaintext));
}

export function decryptHybrid(
  recipientPrivateKey: Uint8Array,
  recipientPqPrivateKey: Uint8Array,
  aad: Uint8Array,
  envelope: Uint8Array,
): Uint8Array {
  return withWasmError("decryptHybrid", () =>
    decrypt_hybrid(recipientPrivateKey, recipientPqPrivateKey, aad, envelope));
}

/** @deprecated use `generatePQKeys` */
export const generatePqKeys = generatePQKeys;
/** @deprecated use `encryptHybrid` */
export const encryptHybridEnvelope = encryptHybrid;
/** @deprecated use `decryptHybrid` */
export const decryptHybridEnvelope = decryptHybrid;
export type { HybridEnvelopeConfig, HybridEnvelopeView } from "./hybrid-envelope.js";
export { CryptoSdkError };

export {
  buildRegistrationCryptoArtifacts,
  reconstructVaultKeyWithMasterPassword,
  OKKEY_PASSWORD_KDF_PARAMS_V1,
  OKKEY_PASSWORD_KDF_PARAMS_VERSION,
  derivePasswordShareC,
  registrationArtifactsToWire,
  type RegistrationSplitKeyMaterial,
  type RegistrationUserKeyMaterial,
} from "./registration.js";

export { encryptVaultItemPayload, decryptVaultItemPayload } from "./vault-item.js";
export {
  generateCapsuleKey,
  encryptCapsulePayload,
  decryptCapsulePayload,
} from "./capsule.js";

export {
  derivePersonalVaultMetadataKey,
  derivePersonalWorkspaceMetadataKey,
  encryptPersonalVaultMetadataPayload,
  decryptPersonalVaultMetadataPayload,
} from "./personal-vault-metadata.js";

export { wrapVaultKeyWithRecoverySecret, unwrapVaultKeyWithRecoverySecret } from "./vault-recovery-key.js";

export {
  OKKEY_CRYPTO_PROFILE_V2,
  MLKEM768_ENCAPSULATION_KEY_LEN,
  MLKEM768_DECAPSULATION_KEY_LEN,
  USER_IDENTITY_ENCRYPTED_PRIVATE_MIN_PAYLOAD_BYTES,
  USER_IDENTITY_SK_AAD,
  encodeUserIdentityPrivateBundleV1,
  decodeUserIdentityPrivateBundleV1,
  generateMlkem768KeypairMaterial,
  encryptUserIdentityPrivateBundle,
  decryptUserIdentityPrivateBundle,
  decryptUserIdentityFromEncryptedBlob,
  userIdentityEncryptedBlobDtoFromPayload,
} from "./user-identity-bundle.js";

export {
  HYBRID_SIGNATURE_ENVELOPE_VERSION_V1,
  HYBRID_SIGNATURE_ALGORITHM_V1,
  HYBRID_SIGNATURE_REQUIRED_CONTEXTS,
  buildHybridSignaturePayloadBytes,
  buildHybridSignatureEnvelopeV1,
  verifyHybridSignatureEnvelopeV1,
  type HybridSignatureEnvelopeV1,
} from "./hybrid-signature.js";

export { getCryptoConfig, listCryptoConfigs, type CryptoConfig } from "./config/index.js";
export { wipeBytes, withSensitiveBytes, withSensitiveBytesAsync } from "./secret-buffer.js";
