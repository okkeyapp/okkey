#![no_main]

use libfuzzer_sys::fuzz_target;
use okkey_crypto_engine::{hybrid, mlkem768, x25519};

fuzz_target!(|data: &[u8]| {
    let (recipient_sk, recipient_pk) = x25519::generate_keypair();
    let (recipient_pq_dk, recipient_pq_ek) = mlkem768::generate_keypair();
    let (sender_sk, _) = x25519::generate_keypair();

    let aad_seed_len = usize::min(64, data.len());
    let aad = &data[..aad_seed_len];
    let plaintext = if data.is_empty() { b"x".as_slice() } else { data };

    if let Ok(envelope) = hybrid::encrypt_hybrid(
        &sender_sk,
        &recipient_pk,
        &recipient_pq_ek,
        aad,
        plaintext,
    ) {
        let _ = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, aad, &envelope);
    }

    let _ = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, aad, data);
});
