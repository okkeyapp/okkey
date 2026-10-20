//! Convert Ed25519 identity material to X25519 for hybrid ECDH.
//!
//! Matches libsodium `crypto_sign_ed25519_sk_to_curve25519` /
//! `crypto_sign_ed25519_pk_to_curve25519` so existing `users.public_key`
//! (Ed25519) can drive the ECC leg of `hybrid_ecc_pq_v1` without a new
//! identity key column.

use curve25519_dalek::edwards::CompressedEdwardsY;
use sha2::{Digest, Sha512};

pub const KEY_LEN: usize = 32;

/// Ed25519 seed (32-byte SigningKey secret) → X25519 private scalar bytes.
/// Clamping is applied by `x25519_dalek::StaticSecret::from` at ECDH time.
pub fn secret_to_x25519(ed25519_seed: &[u8]) -> Result<[u8; KEY_LEN], String> {
  let seed: [u8; KEY_LEN] = ed25519_seed
    .try_into()
    .map_err(|_| "ed25519 secret must be 32 bytes".to_string())?;
  let hash = Sha512::digest(seed);
  let mut out = [0u8; KEY_LEN];
  out.copy_from_slice(&hash[..KEY_LEN]);
  Ok(out)
}

/// Ed25519 verifying key → Montgomery (X25519) public key.
pub fn public_to_x25519(ed25519_public: &[u8]) -> Result<[u8; KEY_LEN], String> {
  let pk: [u8; KEY_LEN] = ed25519_public
    .try_into()
    .map_err(|_| "ed25519 public must be 32 bytes".to_string())?;
  let compressed = CompressedEdwardsY(pk);
  let point = compressed
    .decompress()
    .ok_or_else(|| "invalid ed25519 public key".to_string())?;
  Ok(point.to_montgomery().to_bytes())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{sign, x25519};

  #[test]
  fn ed25519_identity_converts_to_matching_x25519_pair() {
    let (ed_sk, ed_pk) = sign::generate_keypair();
    let x_sk = secret_to_x25519(&ed_sk).expect("sk");
    let x_pk = public_to_x25519(&ed_pk).expect("pk");
    let derived_pk = x25519_dalek::PublicKey::from(&x25519_dalek::StaticSecret::from(x_sk));
    assert_eq!(derived_pk.as_bytes(), &x_pk);
  }

  #[test]
  fn converted_keys_ecdh_round_trip() {
    let (ed_sk_a, ed_pk_a) = sign::generate_keypair();
    let (ed_sk_b, ed_pk_b) = sign::generate_keypair();
    let sk_a = secret_to_x25519(&ed_sk_a).unwrap();
    let pk_a = public_to_x25519(&ed_pk_a).unwrap();
    let sk_b = secret_to_x25519(&ed_sk_b).unwrap();
    let pk_b = public_to_x25519(&ed_pk_b).unwrap();
    let ab = x25519::derive_shared_secret(&sk_a, &pk_b).unwrap();
    let ba = x25519::derive_shared_secret(&sk_b, &pk_a).unwrap();
    assert_eq!(ab, ba);
  }
}
