use ed25519_dalek::{SecretKey, Signature, Signer, SigningKey, Verifier, VerifyingKey};
use ml_dsa::{
  signature::{Signer as MlDsaSigner, Verifier as MlDsaVerifier},
  EncodedVerifyingKey, Keypair as MlDsaKeypair, MlDsa65, Signature as MlDsaSignature,
  SigningKey as MlDsaSigningKey, VerifyingKey as MlDsaVerifyingKey,
};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

pub const HYBRID_SIGNATURE_CONTEXT_MAX_LEN: usize = 255;
pub const HYBRID_SIGNATURE_SIGNER_PQ_KEY_MAX_LEN: usize = 4096;
pub const ED25519_SIGNATURE_LEN: usize = 64;
pub const MLDSA65_SEED_LEN: usize = 32;
/// FIPS 204 ML-DSA-65 public key (`pk`) length.
pub const MLDSA65_PUBLIC_KEY_LEN: usize = 1952;
/// FIPS 204 ML-DSA-65 signature length.
pub const MLDSA65_SIGNATURE_LEN: usize = 3309;
pub const HYBRID_SIGNATURE_V2_LEN: usize = ED25519_SIGNATURE_LEN + MLDSA65_SIGNATURE_LEN;
const HYBRID_SIGNATURE_DOMAIN_TAG: &[u8] = b"okkey-hybrid-signature-v1";
const HYBRID_SIGNATURE_DOMAIN_TAG_V2: &[u8] = b"okkey-hybrid-signature-v2";

pub fn generate_keypair() -> (Vec<u8>, Vec<u8>) {
  let mut sk_bytes = [0u8; 32];
  OsRng.fill_bytes(&mut sk_bytes);
  let secret = SecretKey::from(sk_bytes);
  let signing_key = SigningKey::from(&secret);
  let verify_key = signing_key.verifying_key();
  (signing_key.to_bytes().to_vec(), verify_key.to_bytes().to_vec())
}

pub fn public_key(seed: &[u8]) -> Result<Vec<u8>, String> {
  let signing_key = SigningKey::from_bytes(seed.try_into().map_err(|_| "invalid private key")?);
  Ok(signing_key.verifying_key().to_bytes().to_vec())
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

fn mldsa_seed(bytes: &[u8]) -> Result<ml_dsa::Seed, String> {
  ml_dsa::Seed::try_from(bytes).map_err(|_| "invalid ml-dsa seed".to_string())
}

fn mldsa_signing_key(seed: &[u8]) -> Result<MlDsaSigningKey<MlDsa65>, String> {
  Ok(MlDsaSigningKey::<MlDsa65>::from_seed(&mldsa_seed(seed)?))
}

pub fn mldsa65_public_key(seed: &[u8]) -> Result<Vec<u8>, String> {
  let signing_key = mldsa_signing_key(seed)?;
  Ok(MlDsaKeypair::verifying_key(&signing_key).encode().as_slice().to_vec())
}

pub fn mldsa65_generate_keypair() -> Result<(Vec<u8>, Vec<u8>), String> {
  let mut seed = [0u8; MLDSA65_SEED_LEN];
  OsRng.fill_bytes(&mut seed);
  let public_key = mldsa65_public_key(&seed)?;
  Ok((seed.to_vec(), public_key))
}

pub fn mldsa65_sign(seed: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
  let signing_key = mldsa_signing_key(seed)?;
  let signature = MlDsaSigner::<MlDsaSignature<MlDsa65>>::try_sign(&signing_key, message)
    .map_err(|err| err.to_string())?;
  let encoded = signature.encode();
  if encoded.as_slice().len() != MLDSA65_SIGNATURE_LEN {
    return Err("unexpected ml-dsa signature length".to_string());
  }
  Ok(encoded.as_slice().to_vec())
}

pub fn mldsa65_verify(public_key: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, String> {
  if public_key.len() != MLDSA65_PUBLIC_KEY_LEN {
    return Err("invalid ml-dsa public key".to_string());
  }
  if signature.len() != MLDSA65_SIGNATURE_LEN {
    return Ok(false);
  }
  let encoded_key = EncodedVerifyingKey::<MlDsa65>::try_from(public_key)
    .map_err(|_| "invalid ml-dsa public key".to_string())?;
  let verifying_key = MlDsaVerifyingKey::<MlDsa65>::decode(&encoded_key);
  let parsed = match MlDsaSignature::<MlDsa65>::try_from(signature) {
    Ok(signature) => signature,
    Err(_) => return Ok(false),
  };
  Ok(
    MlDsaVerifier::<MlDsaSignature<MlDsa65>>::verify(&verifying_key, message, &parsed).is_ok(),
  )
}

fn build_hybrid_message_v2(
  signer_pq_public_key: &[u8],
  signer_mldsa_public_key: &[u8],
  context: &[u8],
  message: &[u8],
) -> Result<Vec<u8>, String> {
  if signer_pq_public_key.is_empty() {
    return Err("invalid signer pq public key".to_string());
  }
  if signer_pq_public_key.len() > HYBRID_SIGNATURE_SIGNER_PQ_KEY_MAX_LEN {
    return Err("signer pq public key too large".to_string());
  }
  if signer_mldsa_public_key.len() != MLDSA65_PUBLIC_KEY_LEN {
    return Err("invalid signer ml-dsa public key".to_string());
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
    HYBRID_SIGNATURE_DOMAIN_TAG_V2.len()
      + 1
      + context.len()
      + 2
      + signer_pq_public_key.len()
      + 2
      + signer_mldsa_public_key.len()
      + payload_hash.len(),
  );
  preimage.extend_from_slice(HYBRID_SIGNATURE_DOMAIN_TAG_V2);
  preimage.push(context.len() as u8);
  preimage.extend_from_slice(context);
  preimage.extend_from_slice(&(signer_pq_public_key.len() as u16).to_be_bytes());
  preimage.extend_from_slice(signer_pq_public_key);
  preimage.extend_from_slice(&(signer_mldsa_public_key.len() as u16).to_be_bytes());
  preimage.extend_from_slice(signer_mldsa_public_key);
  preimage.extend_from_slice(payload_hash.as_slice());

  let mut digest = Sha256::new();
  digest.update(preimage);
  Ok(digest.finalize().to_vec())
}

/// Ed25519 signature (64 bytes) followed by an ML-DSA-65 signature.
/// Both signatures cover the same v2 digest. Verification requires both.
pub fn hybrid_sign_v2(
  ed25519_private_key: &[u8],
  mldsa_seed: &[u8],
  signer_pq_public_key: &[u8],
  context: &[u8],
  message: &[u8],
) -> Result<Vec<u8>, String> {
  let mldsa_public_key = mldsa65_public_key(mldsa_seed)?;
  let digest = build_hybrid_message_v2(signer_pq_public_key, &mldsa_public_key, context, message)?;
  let ed25519_signature = sign(ed25519_private_key, &digest)?;
  let mldsa_signature = mldsa65_sign(mldsa_seed, &digest)?;
  let mut out = Vec::with_capacity(HYBRID_SIGNATURE_V2_LEN);
  out.extend_from_slice(&ed25519_signature);
  out.extend_from_slice(&mldsa_signature);
  Ok(out)
}

pub fn hybrid_verify_v2(
  ed25519_public_key: &[u8],
  mldsa_public_key: &[u8],
  signer_pq_public_key: &[u8],
  context: &[u8],
  message: &[u8],
  signature: &[u8],
) -> Result<bool, String> {
  if signature.len() != HYBRID_SIGNATURE_V2_LEN {
    return Ok(false);
  }
  let digest = build_hybrid_message_v2(signer_pq_public_key, mldsa_public_key, context, message)?;
  let ed25519_ok = verify(
    ed25519_public_key,
    &digest,
    &signature[..ED25519_SIGNATURE_LEN],
  )?;
  if !ed25519_ok {
    return Ok(false);
  }
  mldsa65_verify(
    mldsa_public_key,
    &digest,
    &signature[ED25519_SIGNATURE_LEN..],
  )
}
