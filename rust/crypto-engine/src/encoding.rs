use base64::Engine;

pub fn b64_encode(data: &[u8]) -> String {
  base64::engine::general_purpose::STANDARD.encode(data)
}

pub fn b64_decode(s: &str) -> Result<Vec<u8>, base64::DecodeError> {
  base64::engine::general_purpose::STANDARD.decode(s)
}
