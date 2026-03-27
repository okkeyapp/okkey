//! ML-KEM-768 (FIPS 203) key generation for hybrid user identity (PQ leg).
use ml_kem::{EncodedSizeUser, KemCore, MlKem768};
use rand::rngs::OsRng;

/// Encoded ML-KEM-768 encapsulation key length (FIPS 203).
pub const ENCAPSULATION_KEY_LEN: usize = 1184;

/// Encoded ML-KEM-768 decapsulation key length (FIPS 203).
pub const DECAPSULATION_KEY_LEN: usize = 2400;

/// Generate a new ML-KEM-768 keypair using OS RNG.
pub fn generate_keypair() -> (Vec<u8>, Vec<u8>) {
  let mut rng = OsRng;
  let (dk, ek) = MlKem768::generate(&mut rng);
  let dkb = dk.as_bytes().to_vec();
  let ekb = ek.as_bytes().to_vec();
  debug_assert_eq!(dkb.len(), DECAPSULATION_KEY_LEN);
  debug_assert_eq!(ekb.len(), ENCAPSULATION_KEY_LEN);
  (dkb, ekb)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn keypair_lengths_match_constants() {
    let (dk, ek) = generate_keypair();
    assert_eq!(dk.len(), DECAPSULATION_KEY_LEN);
    assert_eq!(ek.len(), ENCAPSULATION_KEY_LEN);
  }
}
