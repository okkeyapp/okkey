use ed25519_dalek::{SecretKey, Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

pub const HYBRID_SIGNATURE_CONTEXT_MAX_LEN: usize = 255;
pub const HYBRID_SIGNATURE_SIGNER_PQ_KEY_MAX_LEN: usize = 4096;
const HYBRID_SIGNATURE_DOMAIN_TAG: &[u8] = b"okkey-hybrid-signature-v1";

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

fn build_hybrid_message_v1(
  signer_pq_public_key: &[u8],
  context: &[u8],
  message: &[u8],
) -> Result<Vec<u8>, String> {
  if signer_pq_public_key.is_empty() {
    return Err("invalid signer pq public key".to_string());
  }
  if signer_pq_public_key.len() > HYBRID_SIGNATURE_SIGNER_PQ_KEY_MAX_LEN {
    return Err("signer pq public key too large".to_string());
  }
  if context.is_empty() {
    return Err("invalid hybrid signature context".to_string());
  }
  if context.len() > HYBRID_SIGNATURE_CONTEXT_MAX_LEN {
    return Err("hybrid signature context too large".to_string());
  }

  let mut payload_hash = Sha256::new();
  payload_hash.update(message);
  let payload_hash = payload_hash.finalize();

  let mut preimage = Vec::with_capacity(
    HYBRID_SIGNATURE_DOMAIN_TAG.len()
      + 1
      + context.len()
      + 2
      + signer_pq_public_key.len()
      + payload_hash.len(),
  );
  preimage.extend_from_slice(HYBRID_SIGNATURE_DOMAIN_TAG);
  preimage.push(context.len() as u8);
  preimage.extend_from_slice(context);
  preimage.extend_from_slice(&(signer_pq_public_key.len() as u16).to_be_bytes());
  preimage.extend_from_slice(signer_pq_public_key);
  preimage.extend_from_slice(payload_hash.as_slice());

  let mut digest = Sha256::new();
  digest.update(preimage);
  Ok(digest.finalize().to_vec())
}

pub fn hybrid_sign_v1(
  private_key: &[u8],
  signer_pq_public_key: &[u8],
  context: &[u8],
  message: &[u8],
) -> Result<Vec<u8>, String> {
  let hybrid_message = build_hybrid_message_v1(signer_pq_public_key, context, message)?;
  sign(private_key, &hybrid_message)
}

pub fn hybrid_verify_v1(
  public_key: &[u8],
  signer_pq_public_key: &[u8],
  context: &[u8],
  message: &[u8],
  signature: &[u8],
) -> Result<bool, String> {
  let hybrid_message = build_hybrid_message_v1(signer_pq_public_key, context, message)?;
  verify(public_key, &hybrid_message, signature)
}
