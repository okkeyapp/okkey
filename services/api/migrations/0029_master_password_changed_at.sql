-- Master password change tracking (ISO timestamps for settings UI).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS master_password_changed_at timestamptz;

UPDATE users
SET master_password_changed_at = COALESCE(master_password_changed_at, created_at)
WHERE master_password_changed_at IS NULL;

ALTER TABLE users
  ALTER COLUMN master_password_changed_at SET DEFAULT now();

ALTER TABLE users
  ALTER COLUMN master_password_changed_at SET NOT NULL;

COMMENT ON COLUMN users.master_password_changed_at IS
  'Last time the master password (password share C / server share A) was set or changed; never stores the password';
