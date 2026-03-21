use aes_gcm::{Aes256Gcm, KeyInit};
use aes_gcm::aead::Aead;
use chacha20poly1305::XChaCha20Poly1305;
use rand::{RngCore};

pub const AES256GCM_NONCE_LEN: usize = 12;
pub const XCHACHA20_NONCE_LEN: usize = 24;

#[derive(Clone, Copy, Debug)]
pub enum AeadAlg {
  Aes256Gcm,
  XChaCha20Poly1305,
}

pub fn generate_nonce(len: usize) -> Vec<u8> {
  let mut nonce = vec![0u8; len];
  rand::rngs::OsRng.fill_bytes(&mut nonce);
  nonce
}

pub fn encrypt(alg: AeadAlg, key: &[u8], nonce: &[u8], aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
  match alg {
    AeadAlg::Aes256Gcm => {
      if key.len() != 32 || nonce.len() != AES256GCM_NONCE_LEN {
        return Err("invalid key or nonce length for AES-256-GCM".into());
      }
      let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
      cipher.encrypt(nonce.into(), aes_gcm::aead::Payload { msg: plaintext, aad })
        .map_err(|e| e.to_string())
    }
    AeadAlg::XChaCha20Poly1305 => {
      if key.len() != 32 || nonce.len() != XCHACHA20_NONCE_LEN {
        return Err("invalid key or nonce length for XChaCha20-Poly1305".into());
      }
      let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|e| e.to_string())?;
      cipher.encrypt(nonce.into(), chacha20poly1305::aead::Payload { msg: plaintext, aad })
        .map_err(|e| e.to_string())
    }
  }
}

pub fn decrypt(alg: AeadAlg, key: &[u8], nonce: &[u8], aad: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
  match alg {
    AeadAlg::Aes256Gcm => {
      if key.len() != 32 || nonce.len() != AES256GCM_NONCE_LEN {
        return Err("invalid key or nonce length for AES-256-GCM".into());
      }
      let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
      cipher.decrypt(nonce.into(), aes_gcm::aead::Payload { msg: ciphertext, aad })
        .map_err(|e| e.to_string())
    }
    AeadAlg::XChaCha20Poly1305 => {
      if key.len() != 32 || nonce.len() != XCHACHA20_NONCE_LEN {
        return Err("invalid key or nonce length for XChaCha20-Poly1305".into());
      }
      let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|e| e.to_string())?;
      cipher.decrypt(nonce.into(), chacha20poly1305::aead::Payload { msg: ciphertext, aad })
        .map_err(|e| e.to_string())
    }
  }
}
