-- Ed25519 verifying key for recovery-key challenge signatures, and a per-session grant.
-- The public key cannot sign. A challenge is single-use and is not itself a proof.

ALTER TABLE user_vault_recovery_wrap
  ADD COLUMN IF NOT EXISTS possession_public_key text NULL;

COMMENT ON COLUMN user_vault_recovery_wrap.possession_public_key IS
  'Base64 Ed25519 verifying key derived from the recovery wrap key. NULL for wraps enrolled before possession proofs. Not a bearer token.';

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recovery_proved_at timestamptz NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recovery_challenge text NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recovery_challenge_expires_at timestamptz NULL;

COMMENT ON COLUMN sessions.recovery_proved_at IS
  'Set when this session proved the recovery key. Does not mark the device trusted.';

COMMENT ON COLUMN sessions.recovery_challenge IS
  'Single-use challenge nonce for a recovery possession signature. Not a proof by itself.';

COMMENT ON COLUMN sessions.recovery_challenge_expires_at IS
  'When recovery_challenge stops being acceptable.';
