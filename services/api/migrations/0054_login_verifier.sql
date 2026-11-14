-- Slow hash of the client login key (self-host sign-in when mail is not deliverable).
-- Not the master password, not password share C, and not VaultKey.
-- Null until the client enrolls (registration, password change, or a later unlock).

ALTER TABLE users
  ADD COLUMN login_verifier bytea,
  ADD COLUMN login_verifier_salt bytea,
  ADD COLUMN login_verifier_params_version smallint;

ALTER TABLE users
  ADD CONSTRAINT users_login_verifier_complete CHECK (
    (
      login_verifier IS NULL
      AND login_verifier_salt IS NULL
      AND login_verifier_params_version IS NULL
    )
    OR (
      login_verifier IS NOT NULL
      AND login_verifier_salt IS NOT NULL
      AND login_verifier_params_version IS NOT NULL
      AND octet_length(login_verifier) = 32
      AND octet_length(login_verifier_salt) = 16
    )
  );

COMMENT ON COLUMN users.login_verifier IS
  'Argon2id hash of the client login key. A leak does not reveal VaultKey or skip the KDF.';
COMMENT ON COLUMN users.login_verifier_salt IS
  'Per-user salt for login_verifier. Independent of password_kdf_salt.';
COMMENT ON COLUMN users.login_verifier_params_version IS
  'Login verifier KDF version (1 = Argon2id m=19456 t=2 p=1 over the 32-byte login key).';
