ALTER TABLE attachments
  DROP CONSTRAINT IF EXISTS attachments_item_id_fkey;

CREATE INDEX IF NOT EXISTS idx_attachments_vault_item_id
  ON attachments(vault_id, item_id);

COMMENT ON COLUMN attachments.item_id IS
  'Client-side item id from the encrypted event log. Not a foreign key to legacy items table.';
