use ed25519_dalek::{Signature, SigningKey, VerifyingKey, Signer, Verifier, SecretKey};
use rand::rngs::OsRng;
use rand::RngCore;

pub fn generate_keypair() -> (Vec<u8>, Vec<u8>) {
  let mut sk_bytes = [0u8; 32];
  OsRng.fill_bytes(&mut sk_bytes);
  let secret = SecretKey::from(sk_bytes);
  let signing_key = SigningKey::from(&secret);
  let verify_key = signing_key.verifying_key();
  (signing_key.to_bytes().to_vec(), verify_key.to_bytes().to_vec())
}

pub fn sign(private_key: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
  let signing_key = SigningKey::from_bytes(private_key.try_into().map_err(|_| "invalid private key")?);
  let signature: Signature = signing_key.sign(message);
  Ok(signature.to_bytes().to_vec())
}

pub fn verify(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, String> {
  let verifying_key = VerifyingKey::from_bytes(public_key.try_into().map_err(|_| "invalid public key")?)
    .map_err(|e| e.to_string())?;
  let signature = Signature::from_bytes(signature.try_into().map_err(|_| "invalid signature")?);
  Ok(verifying_key.verify(message, &signature).is_ok())
}
