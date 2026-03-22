-- Core: TOTP 2FA, backup codes, session tokens (hashed)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled_at timestamptz;

-- encrypted_secret packs: 12-byte IV || 16-byte GCM tag || ciphertext
CREATE TABLE IF NOT EXISTS user_totp_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret bytea NOT NULL,
  algorithm text NOT NULL DEFAULT 'SHA1',
  period_seconds integer NOT NULL DEFAULT 30,
  digits integer NOT NULL DEFAULT 6,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user_id ON user_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user_unused
  ON user_backup_codes(user_id)
  WHERE used_at IS NULL;

-- token_hash = hex sha256 of opaque access token
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
