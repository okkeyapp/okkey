-- Last successful vault unlock (master password), for Members "last login" display.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_vault_unlocked_at timestamptz;

COMMENT ON COLUMN users.last_vault_unlocked_at IS
  'Timestamp of last successful client vault unlock with master password (never stores the password)';
