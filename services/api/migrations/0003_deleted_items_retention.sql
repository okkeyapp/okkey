-- Workspace setting: how long soft-deleted vault items are kept before permanent purge.

ALTER TABLE workspaces
  ADD COLUMN deleted_items_retention_days integer NOT NULL DEFAULT 30;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_deleted_items_retention_days_check
  CHECK (deleted_items_retention_days >= 1 AND deleted_items_retention_days <= 3650);

COMMENT ON COLUMN workspaces.deleted_items_retention_days IS
  'Days to retain soft-deleted vault items before server purges their event history.';

-- Opaque item id hint from clients (server cannot decrypt payloads).
ALTER TABLE events
  ADD COLUMN referenced_item_id bigint;

CREATE INDEX idx_events_vault_referenced_item
  ON events (vault_id, referenced_item_id)
  WHERE referenced_item_id IS NOT NULL;

-- Tracks soft-delete timestamps for retention purge (populated from client sync hints).
CREATE TABLE vault_item_soft_deletes (
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  item_id bigint NOT NULL,
  deleted_at_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vault_id, item_id)
);

CREATE INDEX idx_vault_item_soft_deletes_deleted_at
  ON vault_item_soft_deletes (deleted_at_ms);
