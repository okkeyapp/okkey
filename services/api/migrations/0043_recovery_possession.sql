-- Possession tag for the recovery wrap key, and a per-session grant after proof.
-- The tag is a one-way verifier. It is not the wrap key and cannot decrypt the vault.

ALTER TABLE user_vault_recovery_wrap
  ADD COLUMN IF NOT EXISTS possession_verifier text NULL;

COMMENT ON COLUMN user_vault_recovery_wrap.possession_verifier IS
  'Base64 SHA-256 possession tag of the recovery wrap key. NULL for wraps enrolled before the tag existed.';

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recovery_proved_at timestamptz NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recovery_challenge text NULL;

COMMENT ON COLUMN sessions.recovery_proved_at IS
  'Set when this session proved the recovery key. Does not mark the device trusted.';

COMMENT ON COLUMN sessions.recovery_challenge IS
  'Single-use challenge for a legacy recovery attestation. Cleared when the proof succeeds.';
