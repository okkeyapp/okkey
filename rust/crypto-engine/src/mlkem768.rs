//! ML-KEM-768 (FIPS 203) key generation for hybrid user identity (PQ leg).
use ml_kem::kem::{Decapsulate, Encapsulate};
use ml_kem::{Ciphertext, Encoded, EncodedSizeUser, KemCore, MlKem768, SharedKey};
use rand::rngs::OsRng;

/// Encoded ML-KEM-768 encapsulation key length (FIPS 203).
pub const ENCAPSULATION_KEY_LEN: usize = 1184;

/// Encoded ML-KEM-768 decapsulation key length (FIPS 203).
pub const DECAPSULATION_KEY_LEN: usize = 2400;

/// Encoded ML-KEM-768 ciphertext length (FIPS 203).
pub const CIPHERTEXT_LEN: usize = 1088;

/// Shared secret length for ML-KEM-768.
pub const SHARED_SECRET_LEN: usize = 32;

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

pub fn encapsulate_shared_secret(encapsulation_key: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
  if encapsulation_key.len() != ENCAPSULATION_KEY_LEN {
    return Err("invalid mlkem768 encapsulation key length".into());
  }
  let mut rng = OsRng;
  let encoded_key: Encoded<<MlKem768 as KemCore>::EncapsulationKey> = encapsulation_key
    .try_into()
    .map_err(|_| "invalid mlkem768 encapsulation key bytes".to_string())?;
  let key = <MlKem768 as KemCore>::EncapsulationKey::from_bytes(&encoded_key);
  let (ciphertext, shared_secret): (Ciphertext<MlKem768>, SharedKey<MlKem768>) = key
    .encapsulate(&mut rng)
    .map_err(|_| "mlkem768 encapsulation failed".to_string())?;
  Ok((ciphertext.to_vec(), shared_secret.to_vec()))
}

pub fn decapsulate_shared_secret(decapsulation_key: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
  if decapsulation_key.len() != DECAPSULATION_KEY_LEN {
    return Err("invalid mlkem768 decapsulation key length".into());
  }
  if ciphertext.len() != CIPHERTEXT_LEN {
    return Err("invalid mlkem768 ciphertext length".into());
  }

  let encoded_key: Encoded<<MlKem768 as KemCore>::DecapsulationKey> = decapsulation_key
    .try_into()
    .map_err(|_| "invalid mlkem768 decapsulation key bytes".to_string())?;
  let encoded_ciphertext: Ciphertext<MlKem768> = ciphertext
    .try_into()
    .map_err(|_| "invalid mlkem768 ciphertext bytes".to_string())?;
  let key = <MlKem768 as KemCore>::DecapsulationKey::from_bytes(&encoded_key);
  key.decapsulate(&encoded_ciphertext)
    .map(|secret| secret.to_vec())
    .map_err(|_| "mlkem768 decapsulation failed".to_string())
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

  #[test]
  fn encapsulate_decapsulate_roundtrip() {
    let (dk, ek) = generate_keypair();
    let (ct, ss_send) = encapsulate_shared_secret(&ek).expect("encapsulate");
    let ss_recv = decapsulate_shared_secret(&dk, &ct).expect("decapsulate");
    assert_eq!(ss_send, ss_recv);
    assert_eq!(ct.len(), CIPHERTEXT_LEN);
    assert_eq!(ss_send.len(), SHARED_SECRET_LEN);
  }
}
