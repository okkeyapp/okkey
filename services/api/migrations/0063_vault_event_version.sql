-- Monotonic vault event tip. Event cleanup (purge history) must never lower
-- the next assigned version; deriving tip from MAX(events.version) allowed reuse
-- after ITEM_PURGE tombstones were deleted by a duplicate-purge race.

ALTER TABLE vaults
  ADD COLUMN IF NOT EXISTS event_version integer NOT NULL DEFAULT 0;

UPDATE vaults v
SET event_version = COALESCE(
  (SELECT MAX(e.version) FROM events e WHERE e.vault_id = v.id),
  0
)
WHERE event_version = 0
   OR event_version < COALESCE(
     (SELECT MAX(e.version) FROM events e WHERE e.vault_id = v.id),
     0
   );

COMMENT ON COLUMN vaults.event_version IS
  'Monotonic tip for vault event versions; advanced on append, never decreased by event cleanup.';
