-- ML-KEM-768 encapsulation (public) key for hybrid user identity (base64 on wire).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_pq_key text;

COMMENT ON COLUMN users.public_key IS 'Ed25519 public key (32 bytes), standard base64';
COMMENT ON COLUMN users.public_pq_key IS 'ML-KEM-768 encapsulation key (1184 bytes), standard base64; null for legacy accounts';
