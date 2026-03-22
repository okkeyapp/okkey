-- Password KDF metadata for split-key registration (Core 4.9)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_kdf_salt bytea,
  ADD COLUMN IF NOT EXISTS password_kdf_params_version smallint;

COMMENT ON COLUMN users.password_kdf_salt IS 'Argon2id salt for password share C (never send master password to server)';
COMMENT ON COLUMN users.password_kdf_params_version IS 'KDF parameter set version (1 = m=19456 t=2 p=1)';
