use rand::rngs::OsRng;
use x25519_dalek::{PublicKey, StaticSecret};

pub const PRIVATE_KEY_LEN: usize = 32;
pub const PUBLIC_KEY_LEN: usize = 32;

pub fn generate_keypair() -> (Vec<u8>, Vec<u8>) {
  let secret = StaticSecret::random_from_rng(OsRng);
  let public = PublicKey::from(&secret);
  (secret.to_bytes().to_vec(), public.as_bytes().to_vec())
}

pub fn derive_shared_secret(private_key: &[u8], peer_public_key: &[u8]) -> Result<Vec<u8>, String> {
  let sk: [u8; PRIVATE_KEY_LEN] = private_key.try_into().map_err(|_| "invalid private key")?;
  let pk: [u8; PUBLIC_KEY_LEN] = peer_public_key.try_into().map_err(|_| "invalid public key")?;
  let secret = StaticSecret::from(sk);
  let peer_public = PublicKey::from(pk);
  let shared = secret.diffie_hellman(&peer_public);
  Ok(shared.as_bytes().to_vec())
}
