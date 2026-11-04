use crate::{aead, hybrid, kdf, mlkem768, sign, x25519};
use hex::decode as hex_decode;
use sha2::{Digest, Sha256};

#[test]
fn kdf_derive_consistency() {
  let salt = kdf::generate_salt();
  let params = kdf::KdfParams::default();
  let key1 = kdf::derive_key(b"password", &salt, &params, 32).expect("kdf1");
  let key2 = kdf::derive_key(b"password", &salt, &params, 32).expect("kdf2");
  assert_eq!(key1, key2);
}

#[test]
fn aead_aes_gcm_roundtrip() {
  let key = vec![7u8; 32];
  let nonce = aead::generate_nonce(aead::AES256GCM_NONCE_LEN);
  let aad = b"context";
  let msg = b"hello";
  let ct = aead::encrypt(aead::AeadAlg::Aes256Gcm, &key, &nonce, aad, msg).expect("enc");
  let pt = aead::decrypt(aead::AeadAlg::Aes256Gcm, &key, &nonce, aad, &ct).expect("dec");
  assert_eq!(pt, msg);
}

#[test]
fn aead_xchacha_roundtrip() {
  let key = vec![9u8; 32];
  let nonce = aead::generate_nonce(aead::XCHACHA20_NONCE_LEN);
  let aad = b"ctx";
  let msg = b"hello";
  let ct = aead::encrypt(aead::AeadAlg::XChaCha20Poly1305, &key, &nonce, aad, msg).expect("enc");
  let pt = aead::decrypt(aead::AeadAlg::XChaCha20Poly1305, &key, &nonce, aad, &ct).expect("dec");
  assert_eq!(pt, msg);
}

#[test]
fn ed25519_public_key_matches_rfc8032_vector() {
  let sk = hex_decode("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60").unwrap();
  let pk = hex_decode("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a").unwrap();
  assert_eq!(sign::public_key(&sk).expect("pk"), pk);
}

#[test]
fn ed25519_sign_verify() {
  let (sk, pk) = sign::generate_keypair();
  let msg = b"message";
  let sig = sign::sign(&sk, msg).expect("sign");
  let ok = sign::verify(&pk, msg, &sig).expect("verify");
  assert!(ok);
}

#[test]
fn hybrid_signature_sign_verify() {
  let (sk, pk) = sign::generate_keypair();
  let (_, pq_ek) = mlkem768::generate_keypair();
  let context = b"sync.append";
  let message = br#"{"eventType":"ITEM_CREATE","vaultId":"v1","baseVersion":7}"#;

  let sig = sign::hybrid_sign_v1(&sk, &pq_ek, context, message).expect("hybrid sign");
  let ok = sign::hybrid_verify_v1(&pk, &pq_ek, context, message, &sig).expect("hybrid verify");
  assert!(ok);
}

#[test]
fn mldsa65_sign_verify_and_lengths() {
  let (seed, pk) = sign::mldsa65_generate_keypair().expect("mldsa keygen");
  assert_eq!(seed.len(), sign::MLDSA65_SEED_LEN);
  assert_eq!(pk.len(), sign::MLDSA65_PUBLIC_KEY_LEN);
  assert_eq!(sign::mldsa65_public_key(&seed).expect("pk"), pk);
  let message = b"okkey-mldsa65";
  let signature = sign::mldsa65_sign(&seed, message).expect("mldsa sign");
  assert_eq!(signature.len(), sign::MLDSA65_SIGNATURE_LEN);
  assert!(sign::mldsa65_verify(&pk, message, &signature).expect("mldsa verify"));
  assert!(!sign::mldsa65_verify(&pk, b"other", &signature).expect("mldsa verify"));
}

#[test]
fn hybrid_signature_v2_requires_both_halves() {
  let (ed_sk, ed_pk) = sign::generate_keypair();
  let (mldsa_seed, mldsa_pk) = sign::mldsa65_generate_keypair().expect("mldsa keygen");
  let (_, pq_ek) = mlkem768::generate_keypair();
  let context = b"sync.append";
  let message = br#"{"eventType":"ITEM_CREATE","vaultId":"v1"}"#;

  let signature = sign::hybrid_sign_v2(&ed_sk, &mldsa_seed, &pq_ek, context, message)
    .expect("hybrid sign v2");
  assert_eq!(signature.len(), sign::HYBRID_SIGNATURE_V2_LEN);
  assert!(sign::hybrid_verify_v2(&ed_pk, &mldsa_pk, &pq_ek, context, message, &signature)
    .expect("hybrid verify v2"));

  let mut ed_tamper = signature.clone();
  ed_tamper[0] ^= 0x01;
  assert!(!sign::hybrid_verify_v2(&ed_pk, &mldsa_pk, &pq_ek, context, message, &ed_tamper)
    .expect("ed25519 half"));

  let mut mldsa_tamper = signature.clone();
  mldsa_tamper[sign::ED25519_SIGNATURE_LEN] ^= 0x01;
  assert!(!sign::hybrid_verify_v2(&ed_pk, &mldsa_pk, &pq_ek, context, message, &mldsa_tamper)
    .expect("mldsa half"));

  let mut tail_tamper = signature.clone();
  let last = tail_tamper.len() - 1;
  tail_tamper[last] ^= 0x01;
  assert!(!sign::hybrid_verify_v2(&ed_pk, &mldsa_pk, &pq_ek, context, message, &tail_tamper)
    .expect("mldsa tail"));

  assert!(!sign::hybrid_verify_v2(&ed_pk, &mldsa_pk, &pq_ek, context, b"other", &signature)
    .expect("message"));
}

#[test]
fn hybrid_signature_v1_remains_verifiable() {
  let (sk, pk) = sign::generate_keypair();
  let (_, pq_ek) = mlkem768::generate_keypair();
  let context = b"vault.share";
  let message = br#"{"recipient":"u1"}"#;
  let signature = sign::hybrid_sign_v1(&sk, &pq_ek, context, message).expect("v1 sign");
  assert!(sign::hybrid_verify_v1(&pk, &pq_ek, context, message, &signature).expect("v1 verify"));
  assert!(!sign::hybrid_verify_v2(&pk, &pq_ek, &pq_ek, context, message, &signature)
    .expect("v1 bytes are not a v2 signature"));
}

#[test]
fn hybrid_signature_rejects_tampered_message() {
  let (sk, pk) = sign::generate_keypair();
  let (_, pq_ek) = mlkem768::generate_keypair();
  let context = b"vault.share";
  let message = br#"{"recipient":"u1","baseVersion":3}"#;

  let sig = sign::hybrid_sign_v1(&sk, &pq_ek, context, message).expect("hybrid sign");
  let ok = sign::hybrid_verify_v1(
    &pk,
    &pq_ek,
    context,
    br#"{"recipient":"u1","baseVersion":4}"#,
    &sig,
  ).expect("hybrid verify");
  assert!(!ok);
}

#[test]
fn x25519_shared_secret_match() {
  let (sk1, pk1) = x25519::generate_keypair();
  let (sk2, pk2) = x25519::generate_keypair();
  let s1 = x25519::derive_shared_secret(&sk1, &pk2).expect("s1");
  let s2 = x25519::derive_shared_secret(&sk2, &pk1).expect("s2");
  assert_eq!(s1, s2);
}

#[test]
fn aead_aes_gcm_kat() {
  let key = hex_decode("0000000000000000000000000000000000000000000000000000000000000000").unwrap();
  let nonce = hex_decode("000000000000000000000000").unwrap();
  let pt = hex_decode("00000000000000000000000000000000").unwrap();
  let ct_expected = hex_decode("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919").unwrap();
  let ct = aead::encrypt(aead::AeadAlg::Aes256Gcm, &key, &nonce, &[], &pt).expect("enc");
  assert_eq!(ct, ct_expected);
  let pt_out = aead::decrypt(aead::AeadAlg::Aes256Gcm, &key, &nonce, &[], &ct).expect("dec");
  assert_eq!(pt_out, pt);
}

#[test]
fn ed25519_kat() {
  // RFC 8032 test vector 1
  let sk = hex_decode("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60").unwrap();
  let pk = hex_decode("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a").unwrap();
  let msg: [u8; 0] = [];
  let sig_expected = hex_decode(
    "e5564300c360ac729086e2cc806e828a\
     84877f1eb8e5d974d873e06522490155\
     5fb8821590a33bacc61e39701cf9b46b\
     d25bf5f0595bbe24655141438e7a100b"
  ).unwrap();

  let sig = sign::sign(&sk, &msg).expect("sign");
  assert_eq!(sig, sig_expected);
  let ok = sign::verify(&pk, &msg, &sig).expect("verify");
  assert!(ok);
}

#[test]
fn x25519_kat() {
  // RFC 7748 test vector 1
  let sk = hex_decode("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a").unwrap();
  let pk = hex_decode("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f").unwrap();
  let expected = hex_decode("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742").unwrap();

  let shared = x25519::derive_shared_secret(&sk, &pk).expect("shared");
  assert_eq!(shared, expected);
}

#[test]
fn hybrid_encrypt_decrypt_roundtrip() {
  let (recipient_sk, recipient_pk) = x25519::generate_keypair();
  let (recipient_pq_dk, recipient_pq_ek) = mlkem768::generate_keypair();
  let (sender_sk, _) = x25519::generate_keypair();
  let aad = b"okkey-hybrid-aad";
  let plaintext = b"hybrid message";

  let envelope = hybrid::encrypt_hybrid(
    &sender_sk,
    &recipient_pk,
    &recipient_pq_ek,
    aad,
    plaintext,
  ).expect("encrypt_hybrid");

  let decrypted = hybrid::decrypt_hybrid(
    &recipient_sk,
    &recipient_pq_dk,
    aad,
    &envelope,
  ).expect("decrypt_hybrid");

  assert_eq!(decrypted, plaintext);
}

#[test]
fn hybrid_decrypt_rejects_malformed_envelope() {
  let (recipient_sk, _) = x25519::generate_keypair();
  let (recipient_pq_dk, _) = mlkem768::generate_keypair();
  let aad = b"okkey-hybrid-aad";
  let malformed = vec![0u8; 12];
  let err = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, aad, &malformed)
    .expect_err("must fail");
  assert!(err.contains("too short"));
}

#[test]
fn hybrid_decrypt_rejects_wrong_key() {
  let (recipient_sk, recipient_pk) = x25519::generate_keypair();
  let (recipient_pq_dk, recipient_pq_ek) = mlkem768::generate_keypair();
  let (sender_sk, _) = x25519::generate_keypair();
  let (wrong_pq_dk, _) = mlkem768::generate_keypair();
  let aad = b"okkey-hybrid-aad";
  let plaintext = b"hybrid message";

  let envelope = hybrid::encrypt_hybrid(
    &sender_sk,
    &recipient_pk,
    &recipient_pq_ek,
    aad,
    plaintext,
  ).expect("encrypt_hybrid");

  let err = hybrid::decrypt_hybrid(&recipient_sk, &wrong_pq_dk, aad, &envelope)
    .expect_err("must fail");
  assert!(!err.is_empty());

  let decrypted = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, aad, &envelope)
    .expect("decrypt with correct key");
  assert_eq!(decrypted, plaintext);
}

#[test]
fn hybrid_decrypt_rejects_corrupted_envelope() {
  let (recipient_sk, recipient_pk) = x25519::generate_keypair();
  let (recipient_pq_dk, recipient_pq_ek) = mlkem768::generate_keypair();
  let (sender_sk, _) = x25519::generate_keypair();
  let aad = b"okkey-hybrid-aad";
  let plaintext = b"hybrid message";

  let mut envelope = hybrid::encrypt_hybrid(
    &sender_sk,
    &recipient_pk,
    &recipient_pq_ek,
    aad,
    plaintext,
  ).expect("encrypt_hybrid");

  let last_idx = envelope.len() - 1;
  envelope[last_idx] ^= 0x01;

  let err = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, aad, &envelope)
    .expect_err("must fail on tampered envelope");
  assert!(!err.is_empty());
}

fn count_len(log: &[usize], len: usize) -> usize {
  log.iter().filter(|value| **value == len).count()
}

#[test]
fn hybrid_encrypt_wipes_ephemeral_secrets() {
  let (recipient_sk, recipient_pk) = x25519::generate_keypair();
  let (recipient_pq_dk, recipient_pq_ek) = mlkem768::generate_keypair();
  let aad = b"okkey-hybrid-aad";

  crate::secret::start_wipe_record();
  let envelope = hybrid::encrypt_hybrid(&[], &recipient_pk, &recipient_pq_ek, aad, b"share")
    .expect("encrypt");
  let encrypt_wipes = crate::secret::take_wipe_record();
  // ephemeral X25519 secret, ECC shared secret, ML-KEM shared secret, AEAD key
  assert_eq!(count_len(&encrypt_wipes, 32), 4);

  crate::secret::start_wipe_record();
  let _ = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, aad, &envelope).expect("decrypt");
  let decrypt_wipes = crate::secret::take_wipe_record();
  // ECC shared secret, ML-KEM shared secret, AEAD key. Recipient private keys stay.
  assert_eq!(count_len(&decrypt_wipes, 32), 3);
  assert_eq!(recipient_sk.iter().filter(|byte| **byte != 0).count() > 0, true);
}

#[test]
fn hybrid_encrypt_wipes_secrets_on_error() {
  crate::secret::start_wipe_record();
  let err = hybrid::encrypt_hybrid(&[], &[0u8; 32], &[0u8; 8], b"aad", b"share");
  assert!(err.is_err());
  let wipes = crate::secret::take_wipe_record();
  // Ephemeral private key and ECC shared secret exist before ML-KEM rejects the key.
  assert!(count_len(&wipes, 32) >= 2);

  crate::secret::start_wipe_record();
  let err = hybrid::encrypt_hybrid(&[], &[], &[], b"aad", b"");
  assert!(err.is_err());
  assert!(crate::secret::take_wipe_record().is_empty());
}

#[test]
fn hybrid_decrypt_wipes_derived_secrets_when_envelope_is_tampered() {
  let (recipient_sk, recipient_pk) = x25519::generate_keypair();
  let (recipient_pq_dk, recipient_pq_ek) = mlkem768::generate_keypair();
  let mut envelope = hybrid::encrypt_hybrid(&[], &recipient_pk, &recipient_pq_ek, b"aad", b"share")
    .expect("encrypt");
  let last = envelope.len() - 1;
  envelope[last] ^= 0x01;

  crate::secret::start_wipe_record();
  let err = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, b"aad", &envelope);
  assert!(err.is_err());
  assert_eq!(count_len(&crate::secret::take_wipe_record(), 32), 3);
}

#[test]
fn hybrid_golden_layout_sha256_matches_cross_layer_fixture() {
  let mut envelope = Vec::with_capacity(hybrid::HYBRID_ENVELOPE_FIXED_HEADER_LEN + 20);
  envelope.push(hybrid::HYBRID_ENVELOPE_VERSION_V1);
  envelope.push(hybrid::HYBRID_KDF_SHA256);
  envelope.push(hybrid::HYBRID_AEAD_XCHACHA20_POLY1305);
  envelope.push(0u8);
  envelope.extend(vec![0x11u8; x25519::PUBLIC_KEY_LEN]);
  envelope.extend(vec![0x22u8; mlkem768::CIPHERTEXT_LEN]);
  envelope.extend(vec![0x33u8; aead::XCHACHA20_NONCE_LEN]);
  envelope.extend(hex_decode("00112233445566778899aabbccddeeff01020304").unwrap());

  assert_eq!(envelope.len(), 1168);
  let digest = Sha256::digest(&envelope);
  assert_eq!(
    hex::encode(digest),
    "5654ee284072a4b74e03edbbfaae7ac81d1a62062a5553d72c7f10e634dac34f"
  );
}
