declare module "@okkey/crypto-wasm" {
  export default function init(): Promise<void>;
  export function random_bytes(len: number): Uint8Array;
  export function kdf_derive(password: Uint8Array, salt: Uint8Array, mCost: number, tCost: number, pCost: number, outLen: number): Uint8Array;
  export function aead_encrypt(alg: string, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array;
  export function aead_decrypt(alg: string, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  export function ed25519_keypair(): Uint8Array;
  export function ed25519_sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array;
  export function ed25519_verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
  export function x25519_keypair(): Uint8Array;
  export function x25519_shared(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array;
  export function b64_encode(data: Uint8Array): string;
  export function b64_decode(s: string): Uint8Array;
  export function sha256(data: Uint8Array): Uint8Array;
  export function mlkem768_decapsulation_key_len(): number;
  export function mlkem768_encapsulation_key_len(): number;
  /** `[decapsulation_key || encapsulation_key]` (fixed ML-KEM-768 lengths). */
  export function mlkem768_keypair(): Uint8Array;
  /** Alias for ML-KEM-768 keypair used by hybrid/PQ flow. */
  export function generate_pq_keys(): Uint8Array;
  export function hybrid_envelope_fixed_header_len(): number;
  export function encrypt_hybrid(
    senderPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    recipientPqPublicKey: Uint8Array,
    aad: Uint8Array,
    plaintext: Uint8Array,
  ): Uint8Array;
  export function decrypt_hybrid(
    recipientPrivateKey: Uint8Array,
    recipientPqPrivateKey: Uint8Array,
    aad: Uint8Array,
    envelope: Uint8Array,
  ): Uint8Array;
}
