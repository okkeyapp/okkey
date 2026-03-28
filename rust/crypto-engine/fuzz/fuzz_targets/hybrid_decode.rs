#![no_main]

use libfuzzer_sys::fuzz_target;
use okkey_crypto_engine::{hybrid, mlkem768, x25519};

fuzz_target!(|data: &[u8]| {
    let (recipient_sk, _) = x25519::generate_keypair();
    let (recipient_pq_dk, _) = mlkem768::generate_keypair();
    let aad = b"fuzz-hybrid-decode";

    let _ = hybrid::decrypt_hybrid(&recipient_sk, &recipient_pq_dk, aad, data);
});
