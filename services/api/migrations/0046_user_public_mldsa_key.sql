-- ML-DSA-65 verifying key for the account identity signature scheme.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_mldsa_key text NULL;

COMMENT ON COLUMN users.public_mldsa_key IS
  'ML-DSA-65 verifying key (1952 bytes), standard base64. NULL until registration or unlock stores one.';
