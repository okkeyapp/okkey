-- Store max file size as whole megabytes (1–1024).

ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_max_file_size_mb_check;

UPDATE workspaces
SET max_file_size_mb = ROUND(max_file_size_mb)::integer;

ALTER TABLE workspaces
  ALTER COLUMN max_file_size_mb TYPE integer
  USING ROUND(max_file_size_mb)::integer;

ALTER TABLE workspaces
  ALTER COLUMN max_file_size_mb SET DEFAULT 2;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_max_file_size_mb_check
  CHECK (max_file_size_mb >= 1 AND max_file_size_mb <= 1024);

COMMENT ON COLUMN workspaces.max_file_size_mb IS
  'Maximum plaintext file size in whole megabytes for item file field uploads.';
