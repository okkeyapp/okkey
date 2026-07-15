-- Per-workspace constraints for key-field file attachments in vault items.

ALTER TABLE workspaces
  ADD COLUMN allowed_file_extensions text[] NOT NULL DEFAULT '{jpg,png,pdf,zip,rar}',
  ADD COLUMN max_file_size_mb integer NOT NULL DEFAULT 2;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_max_file_size_mb_check
  CHECK (max_file_size_mb >= 1 AND max_file_size_mb <= 1024);

COMMENT ON COLUMN workspaces.allowed_file_extensions IS
  'Lowercase file extensions allowed for item file fields. Empty array means any extension.';

COMMENT ON COLUMN workspaces.max_file_size_mb IS
  'Maximum plaintext file size in megabytes for item file field uploads.';
