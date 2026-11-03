-- Mark record/template favicon attachments so the API can keep one icon slot per item
-- and exempt only that slot from files-in-items / workspace size gates.

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS purpose text;

COMMENT ON COLUMN attachments.purpose IS
  'Optional upload purpose. item-favicon = the single record/template icon slot.';

-- At most one item-favicon attachment per vault item (or template id used as item_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_one_item_favicon
  ON attachments (vault_id, item_id)
  WHERE purpose = 'item-favicon' AND item_id IS NOT NULL;
