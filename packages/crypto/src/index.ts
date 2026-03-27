import initWasm, {
  random_bytes,
  kdf_derive,
  aead_encrypt,
  aead_decrypt,
  ed25519_keypair,
  ed25519_sign,
  ed25519_verify,
  x25519_keypair,
  x25519_shared,
  b64_encode,
  b64_decode,
  sha256,
  generate_pq_keys,
  hybrid_envelope_fixed_header_len,
  encrypt_hybrid,
  decrypt_hybrid,
} from "@okkey/crypto-wasm";

export type AeadAlg = "aes-256-gcm" | "xchacha20-poly1305";

let wasmReady: Promise<void> | undefined;

export async function initCrypto(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  return wasmReady;
}

export function randomBytes(len: number): Uint8Array {
  return random_bytes(len);
}

export function kdfDerive(password: Uint8Array, salt: Uint8Array, params: { mCost: number; tCost: number; pCost: number }, outLen: number): Uint8Array {
  return kdf_derive(password, salt, params.mCost, params.tCost, params.pCost, outLen);
}

export function aeadEncrypt(alg: AeadAlg, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return aead_encrypt(alg, key, nonce, aad, plaintext);
}

export function aeadDecrypt(alg: AeadAlg, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return aead_decrypt(alg, key, nonce, aad, ciphertext);
}

export function ed25519Keypair(): Uint8Array {
  return ed25519_keypair();
}

export function ed25519Sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519_sign(privateKey, message);
}

export function ed25519Verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  return ed25519_verify(publicKey, message, signature);
}

export function x25519Keypair(): Uint8Array {
  return x25519_keypair();
}

export function x25519Shared(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  return x25519_shared(privateKey, peerPublicKey);
}

export function b64Encode(data: Uint8Array): string {
  return b64_encode(data);
}

export function b64Decode(s: string): Uint8Array {
  return b64_decode(s);
}

export function sha256Digest(data: Uint8Array): Uint8Array {
  return sha256(data);
}

export function generatePQKeys(): Uint8Array {
  return generate_pq_keys();
}

export function hybridEnvelopeFixedHeaderLen(): number {
  return hybrid_envelope_fixed_header_len();
}

export function encryptHybrid(
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPqPublicKey: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  return encrypt_hybrid(senderPrivateKey, recipientPublicKey, recipientPqPublicKey, aad, plaintext);
}

export function decryptHybrid(
  recipientPrivateKey: Uint8Array,
  recipientPqPrivateKey: Uint8Array,
  aad: Uint8Array,
  envelope: Uint8Array,
): Uint8Array {
  return decrypt_hybrid(recipientPrivateKey, recipientPqPrivateKey, aad, envelope);
}

export {
  buildRegistrationCryptoArtifacts,
  OKKEY_PASSWORD_KDF_PARAMS_V1,
  OKKEY_PASSWORD_KDF_PARAMS_VERSION,
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
  encryptPersonalVaultMetadataPayload,
  decryptPersonalVaultMetadataPayload,
} from "./personal-vault-metadata.js";

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
