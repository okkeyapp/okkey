-- Track when the user last copied or downloaded TOTP backup codes (account security score).
ALTER TABLE user_totp_credentials
  ADD COLUMN IF NOT EXISTS backup_codes_exported_at timestamptz;
