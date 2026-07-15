-- Allow fractional max file size in megabytes (e.g. 1.5 MB).

ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_max_file_size_mb_check;

ALTER TABLE workspaces
  ALTER COLUMN max_file_size_mb TYPE numeric(10, 2)
  USING max_file_size_mb::numeric(10, 2);

ALTER TABLE workspaces
  ALTER COLUMN max_file_size_mb SET DEFAULT 1.5;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_max_file_size_mb_check
  CHECK (max_file_size_mb >= 0.1 AND max_file_size_mb <= 1024);

COMMENT ON COLUMN workspaces.max_file_size_mb IS
  'Maximum plaintext file size in megabytes for item file field uploads (supports decimals).';
