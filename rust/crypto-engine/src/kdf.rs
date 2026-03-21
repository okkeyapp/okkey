use argon2::{Argon2, Params};
use rand::{rngs::OsRng, RngCore};

pub const DEFAULT_ARGON2_M_COST: u32 = 19456;
pub const DEFAULT_ARGON2_T_COST: u32 = 2;
pub const DEFAULT_ARGON2_P_COST: u32 = 1;
pub const SALT_LEN: usize = 16;

#[derive(Clone, Debug)]
pub struct KdfParams {
  pub m_cost: u32,
  pub t_cost: u32,
  pub p_cost: u32,
}

impl Default for KdfParams {
  fn default() -> Self {
    Self {
      m_cost: DEFAULT_ARGON2_M_COST,
      t_cost: DEFAULT_ARGON2_T_COST,
      p_cost: DEFAULT_ARGON2_P_COST,
    }
  }
}

pub fn generate_salt() -> [u8; SALT_LEN] {
  let mut salt = [0u8; SALT_LEN];
  OsRng.fill_bytes(&mut salt);
  salt
}

pub fn derive_key(password: &[u8], salt: &[u8], params: &KdfParams, out_len: usize) -> Result<Vec<u8>, String> {
  let argon = Argon2::new(
    argon2::Algorithm::Argon2id,
    argon2::Version::V0x13,
    Params::new(params.m_cost, params.t_cost, params.p_cost, Some(out_len))
      .map_err(|e| format!("argon2 params: {e}"))?,
  );

  let mut output = vec![0u8; out_len];
  argon
    .hash_password_into(password, salt, &mut output)
    .map_err(|e| format!("argon2 hash: {e}"))?;
  Ok(output)
}
