-- Server-side default for "vault lock after inactivity" (seconds). Client may cache; future UI can PATCH.
-- 900 s = 15 minutes.

ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_idle_lock_seconds integer NOT NULL DEFAULT 900;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_vault_idle_lock_seconds_check;
ALTER TABLE users ADD CONSTRAINT users_vault_idle_lock_seconds_check CHECK (
  vault_idle_lock_seconds >= 60 AND vault_idle_lock_seconds <= 86400
);
