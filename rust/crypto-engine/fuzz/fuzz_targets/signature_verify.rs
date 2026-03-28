#![no_main]

use libfuzzer_sys::fuzz_target;
use okkey_crypto_engine::sign;

fuzz_target!(|data: &[u8]| {
    if data.len() < 96 {
        let _ = sign::verify(data, b"", data);
        return;
    }

    let public_key = &data[..32];
    let signature = &data[data.len() - 64..];
    let message = &data[32..data.len() - 64];
    let _ = sign::verify(public_key, message, signature);
});
