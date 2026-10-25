-- Persist per-event soft-delete hint so clients can replay ITEM_UPDATE without
-- trusting plaintext `deleted` alone. NULL = legacy rows (pre-migration).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS item_soft_deleted boolean NULL;

COMMENT ON COLUMN events.item_soft_deleted IS
  'Client soft-delete hint for ITEM_* events; true when the append marked soft-delete.';

-- ITEM_DELETE always means soft-delete; backfill so replay does not depend on plaintext.
UPDATE events
SET item_soft_deleted = true
WHERE event_type = 'ITEM_DELETE'
  AND item_soft_deleted IS NULL;
