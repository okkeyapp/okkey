import initWasm, {
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
} from "@okkey/crypto-wasm";

export type AeadAlg = "aes-256-gcm" | "xchacha20-poly1305";

let wasmReady: Promise<void> | undefined;

export async function initCrypto(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm().then(() => undefined);
  }
  return wasmReady;
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
