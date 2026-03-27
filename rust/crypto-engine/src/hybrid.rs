use sha2::{Digest, Sha256};

use crate::{aead, mlkem768, x25519};

pub const HYBRID_ENVELOPE_VERSION_V1: u8 = 1;
pub const HYBRID_KDF_SHA256: u8 = 1;
pub const HYBRID_AEAD_XCHACHA20_POLY1305: u8 = 1;

pub const HYBRID_ENVELOPE_FIXED_HEADER_LEN: usize =
  1 + 1 + 1 + 1 + x25519::PUBLIC_KEY_LEN + mlkem768::CIPHERTEXT_LEN + aead::XCHACHA20_NONCE_LEN;

#[derive(Debug, Clone)]
struct ParsedEnvelope<'a> {
  ecc_ephemeral_public_key: &'a [u8],
  pq_ciphertext: &'a [u8],
  nonce: &'a [u8],
  ciphertext: &'a [u8],
}

pub fn derive_hybrid_aead_key(ecc_shared_secret: &[u8], pq_shared_secret: &[u8], aad: &[u8]) -> Result<[u8; 32], String> {
  if ecc_shared_secret.len() != 32 {
    return Err("invalid ECC shared secret length".into());
  }
  if pq_shared_secret.len() != mlkem768::SHARED_SECRET_LEN {
    return Err("invalid PQ shared secret length".into());
  }
  let mut hasher = Sha256::new();
  hasher.update(b"okkey-hybrid-v1-key-derivation");
  hasher.update(ecc_shared_secret);
  hasher.update(pq_shared_secret);
  hasher.update(aad);
  let digest = hasher.finalize();
  let mut out = [0u8; 32];
  out.copy_from_slice(&digest);
  Ok(out)
}

pub fn encrypt_hybrid(
  _sender_private_key: &[u8],
  recipient_public_key: &[u8],
  recipient_pq_public_key: &[u8],
  aad: &[u8],
  plaintext: &[u8],
) -> Result<Vec<u8>, String> {
  if plaintext.is_empty() {
    return Err("plaintext cannot be empty".into());
  }
  let (ecc_ephemeral_private_key, ecc_ephemeral_public_key) = x25519::generate_keypair();
  let ecc_shared_secret = x25519::derive_shared_secret(&ecc_ephemeral_private_key, recipient_public_key)?;
  let (pq_ciphertext, pq_shared_secret) = mlkem768::encapsulate_shared_secret(recipient_pq_public_key)?;
  let key = derive_hybrid_aead_key(&ecc_shared_secret, &pq_shared_secret, aad)?;
  let nonce = aead::generate_nonce(aead::XCHACHA20_NONCE_LEN);
  let ciphertext = aead::encrypt(aead::AeadAlg::XChaCha20Poly1305, &key, &nonce, aad, plaintext)?;

  let mut out = Vec::with_capacity(HYBRID_ENVELOPE_FIXED_HEADER_LEN + ciphertext.len());
  out.push(HYBRID_ENVELOPE_VERSION_V1);
  out.push(HYBRID_KDF_SHA256);
  out.push(HYBRID_AEAD_XCHACHA20_POLY1305);
  out.push(0);
  out.extend_from_slice(&ecc_ephemeral_public_key);
  out.extend_from_slice(&pq_ciphertext);
  out.extend_from_slice(&nonce);
  out.extend_from_slice(&ciphertext);
  Ok(out)
}

pub fn decrypt_hybrid(
  recipient_private_key: &[u8],
  recipient_pq_private_key: &[u8],
  aad: &[u8],
  envelope: &[u8],
) -> Result<Vec<u8>, String> {
  let parsed = parse_envelope(envelope)?;
  let ecc_shared_secret = x25519::derive_shared_secret(recipient_private_key, parsed.ecc_ephemeral_public_key)?;
  let pq_shared_secret = mlkem768::decapsulate_shared_secret(recipient_pq_private_key, parsed.pq_ciphertext)?;
  let key = derive_hybrid_aead_key(&ecc_shared_secret, &pq_shared_secret, aad)?;
  aead::decrypt(
    aead::AeadAlg::XChaCha20Poly1305,
    &key,
    parsed.nonce,
    aad,
    parsed.ciphertext,
  )
}

fn parse_envelope(envelope: &[u8]) -> Result<ParsedEnvelope<'_>, String> {
  if envelope.len() < HYBRID_ENVELOPE_FIXED_HEADER_LEN + 16 {
    return Err("hybrid envelope too short".into());
  }
  if envelope[0] != HYBRID_ENVELOPE_VERSION_V1 {
    return Err("unsupported hybrid envelope version".into());
  }
  if envelope[1] != HYBRID_KDF_SHA256 {
    return Err("unsupported hybrid KDF id".into());
  }
  if envelope[2] != HYBRID_AEAD_XCHACHA20_POLY1305 {
    return Err("unsupported hybrid AEAD id".into());
  }

  let ecc_start = 4;
  let ecc_end = ecc_start + x25519::PUBLIC_KEY_LEN;
  let pq_end = ecc_end + mlkem768::CIPHERTEXT_LEN;
  let nonce_end = pq_end + aead::XCHACHA20_NONCE_LEN;

  Ok(ParsedEnvelope {
    ecc_ephemeral_public_key: &envelope[ecc_start..ecc_end],
    pq_ciphertext: &envelope[ecc_end..pq_end],
    nonce: &envelope[pq_end..nonce_end],
    ciphertext: &envelope[nonce_end..],
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use hex::decode as hex_decode;

  #[test]
  fn derive_hybrid_aead_key_kat() {
    let ecc = [0u8; 32];
    let pq = [0x11u8; 32];
    let aad = b"okkey-hybrid-test-aad";
    let expected = hex_decode("085ab54423a95fa2ecfad189cea6da4d99704a13105f795d641c96781bbde83f").unwrap();
    let out = derive_hybrid_aead_key(&ecc, &pq, aad).expect("derive");
    assert_eq!(out.as_slice(), expected.as_slice());
  }
}
