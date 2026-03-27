use wasm_bindgen::prelude::*;
use sha2::{Digest, Sha256};

use crate::{aead, encoding, hybrid, kdf, mlkem768, sign, x25519};
use getrandom::getrandom;

#[wasm_bindgen]
pub fn random_bytes(len: usize) -> Result<Vec<u8>, JsValue> {
  if len > 4096 {
    return Err(JsValue::from_str("len too large"));
  }
  let mut buf = vec![0u8; len];
  getrandom(&mut buf).map_err(|e| JsValue::from_str(&format!("rng: {e}")))?;
  Ok(buf)
}

#[wasm_bindgen]
pub fn kdf_derive(password: &[u8], salt: &[u8], m_cost: u32, t_cost: u32, p_cost: u32, out_len: usize) -> Result<Vec<u8>, JsValue> {
  let params = kdf::KdfParams { m_cost, t_cost, p_cost };
  kdf::derive_key(password, salt, &params, out_len).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn aead_encrypt(alg: &str, key: &[u8], nonce: &[u8], aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
  let alg = match alg {
    "aes-256-gcm" => aead::AeadAlg::Aes256Gcm,
    "xchacha20-poly1305" => aead::AeadAlg::XChaCha20Poly1305,
    _ => return Err(JsValue::from_str("unsupported aead alg")),
  };
  aead::encrypt(alg, key, nonce, aad, plaintext).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn aead_decrypt(alg: &str, key: &[u8], nonce: &[u8], aad: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, JsValue> {
  let alg = match alg {
    "aes-256-gcm" => aead::AeadAlg::Aes256Gcm,
    "xchacha20-poly1305" => aead::AeadAlg::XChaCha20Poly1305,
    _ => return Err(JsValue::from_str("unsupported aead alg")),
  };
  aead::decrypt(alg, key, nonce, aad, ciphertext).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn ed25519_keypair() -> Vec<u8> {
  let (sk, pk) = sign::generate_keypair();
  [sk, pk].concat()
}

#[wasm_bindgen]
pub fn ed25519_sign(private_key: &[u8], message: &[u8]) -> Result<Vec<u8>, JsValue> {
  sign::sign(private_key, message).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn ed25519_verify(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, JsValue> {
  sign::verify(public_key, message, signature).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn x25519_keypair() -> Vec<u8> {
  let (sk, pk) = x25519::generate_keypair();
  [sk, pk].concat()
}

#[wasm_bindgen]
pub fn x25519_shared(private_key: &[u8], peer_public_key: &[u8]) -> Result<Vec<u8>, JsValue> {
  x25519::derive_shared_secret(private_key, peer_public_key).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn b64_encode(data: &[u8]) -> String {
  encoding::b64_encode(data)
}

#[wasm_bindgen]
pub fn b64_decode(s: &str) -> Result<Vec<u8>, JsValue> {
  encoding::b64_decode(s).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn sha256(data: &[u8]) -> Vec<u8> {
  let mut hasher = Sha256::new();
  hasher.update(data);
  hasher.finalize().to_vec()
}

/// Byte length of encoded ML-KEM-768 decapsulation (private) key.
#[wasm_bindgen]
pub fn mlkem768_decapsulation_key_len() -> usize {
  mlkem768::DECAPSULATION_KEY_LEN
}

/// Byte length of encoded ML-KEM-768 encapsulation (public) key.
#[wasm_bindgen]
pub fn mlkem768_encapsulation_key_len() -> usize {
  mlkem768::ENCAPSULATION_KEY_LEN
}

/// Random ML-KEM-768 keypair: `[decapsulation_key || encapsulation_key]` (fixed lengths).
#[wasm_bindgen]
pub fn mlkem768_keypair() -> Vec<u8> {
  let (dk, ek) = mlkem768::generate_keypair();
  let mut out = Vec::with_capacity(dk.len() + ek.len());
  out.extend_from_slice(&dk);
  out.extend_from_slice(&ek);
  out
}

/// Random ML-KEM-768 keypair alias for hybrid/PQ operations.
#[wasm_bindgen]
pub fn generate_pq_keys() -> Vec<u8> {
  mlkem768_keypair()
}

#[wasm_bindgen]
pub fn hybrid_envelope_fixed_header_len() -> usize {
  hybrid::HYBRID_ENVELOPE_FIXED_HEADER_LEN
}

#[wasm_bindgen]
pub fn encrypt_hybrid(
  sender_private_key: &[u8],
  recipient_public_key: &[u8],
  recipient_pq_public_key: &[u8],
  aad: &[u8],
  plaintext: &[u8],
) -> Result<Vec<u8>, JsValue> {
  hybrid::encrypt_hybrid(
    sender_private_key,
    recipient_public_key,
    recipient_pq_public_key,
    aad,
    plaintext,
  ).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn decrypt_hybrid(
  recipient_private_key: &[u8],
  recipient_pq_private_key: &[u8],
  aad: &[u8],
  envelope: &[u8],
) -> Result<Vec<u8>, JsValue> {
  hybrid::decrypt_hybrid(
    recipient_private_key,
    recipient_pq_private_key,
    aad,
    envelope,
  ).map_err(|e| JsValue::from_str(&e))
}
