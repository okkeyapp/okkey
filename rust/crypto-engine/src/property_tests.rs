use crate::{hybrid, mlkem768, sign, x25519};
use proptest::prelude::*;

proptest! {
    #[test]
    fn hybrid_roundtrip_property(
        aad in proptest::collection::vec(any::<u8>(), 0..64),
        plaintext in proptest::collection::vec(any::<u8>(), 1..256),
    ) {
        let (recipient_sk, recipient_pk) = x25519::generate_keypair();
        let (recipient_pq_dk, recipient_pq_ek) = mlkem768::generate_keypair();
        let (sender_sk, _) = x25519::generate_keypair();

        let envelope = hybrid::encrypt_hybrid(
            &sender_sk,
            &recipient_pk,
            &recipient_pq_ek,
            &aad,
            &plaintext,
        ).expect("encrypt_hybrid should succeed for generated key material");

        let decrypted = hybrid::decrypt_hybrid(
            &recipient_sk,
            &recipient_pq_dk,
            &aad,
            &envelope,
        ).expect("decrypt_hybrid should succeed for matching key material");

        prop_assert_eq!(decrypted, plaintext);
    }
}

proptest! {
    #[test]
    fn hybrid_decrypt_malformed_input_never_panics(
        aad in proptest::collection::vec(any::<u8>(), 0..64),
        malformed in proptest::collection::vec(any::<u8>(), 0..4096),
    ) {
        let (recipient_sk, _) = x25519::generate_keypair();
        let (recipient_pq_dk, _) = mlkem768::generate_keypair();
        let _ = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, &aad, &malformed);
    }
}

proptest! {
    #[test]
    fn signature_verify_property(
        message in proptest::collection::vec(any::<u8>(), 0..512),
        bit in 0usize..512usize,
    ) {
        let (sk, pk) = sign::generate_keypair();
        let sig = sign::sign(&sk, &message).expect("sign should succeed");
        let verified = sign::verify(&pk, &message, &sig).expect("verify should return bool");
        prop_assert!(verified);

        let mut tampered = sig.clone();
        let idx = usize::min(bit / 8, tampered.len().saturating_sub(1));
        tampered[idx] ^= 1u8 << (bit % 8);
        let tampered_result = sign::verify(&pk, &message, &tampered).expect("verify should return bool");
        prop_assert!(!tampered_result);
    }
}
