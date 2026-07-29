ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS builtin_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_workspace_builtin_key
  ON profiles (workspace_id, builtin_key)
  WHERE builtin_key IS NOT NULL;
