-- Creator attribution for own-only role/profile permissions (put/delete = 2).

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS created_by bigint REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS created_by bigint REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN roles.created_by IS
  'User who created a custom role; NULL for builtin/legacy. Used for own-only put/delete.';

COMMENT ON COLUMN profiles.created_by IS
  'User who created a custom profile; NULL for builtin/legacy. Used for own-only put/delete.';
