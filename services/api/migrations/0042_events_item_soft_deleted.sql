-- Persist per-event soft-delete hint so clients can replay ITEM_UPDATE without
-- trusting plaintext `deleted` alone. After backfill the column is NOT NULL.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS item_soft_deleted boolean NULL;

COMMENT ON COLUMN events.item_soft_deleted IS
  'Client soft-delete hint for ITEM_* events; true when the append marked soft-delete.';

-- ITEM_DELETE always means soft-delete.
UPDATE events
SET item_soft_deleted = true
WHERE event_type = 'ITEM_DELETE'
  AND item_soft_deleted IS NULL;

-- Best-effort: mark the latest ITEM_UPDATE for items currently soft-deleted.
UPDATE events e
SET item_soft_deleted = true
FROM vault_item_soft_deletes sd
WHERE e.vault_id = sd.vault_id
  AND e.referenced_item_id = sd.item_id
  AND e.event_type = 'ITEM_UPDATE'
  AND e.item_soft_deleted IS NULL
  AND e.version = (
    SELECT MAX(e2.version)
    FROM events e2
    WHERE e2.vault_id = e.vault_id
      AND e2.referenced_item_id = e.referenced_item_id
      AND e2.event_type = 'ITEM_UPDATE'
  );

-- All remaining rows (including ITEM_CREATE / non-delete ITEM_UPDATE) → false.
UPDATE events
SET item_soft_deleted = false
WHERE item_soft_deleted IS NULL;

ALTER TABLE events
  ALTER COLUMN item_soft_deleted SET DEFAULT false;

ALTER TABLE events
  ALTER COLUMN item_soft_deleted SET NOT NULL;
