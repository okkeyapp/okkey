-- Workspace toggle: allow file fields and uploads in vault items.

ALTER TABLE workspaces
  ADD COLUMN files_in_items_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN workspaces.files_in_items_enabled IS
  'When false, item file fields and secure-files category are hidden; existing attachments remain readable.';
