-- Server-side favicon blobs for vault items (opaque ids; URLs resolved at write time by clients).

CREATE TABLE vault_item_favicons (
  id bigint PRIMARY KEY,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  item_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, item_id)
);

CREATE INDEX idx_vault_item_favicons_vault_item
  ON vault_item_favicons (vault_id, item_id);

COMMENT ON TABLE vault_item_favicons IS
  'Maps vault items to snowflake favicon blob ids stored in object storage (favicons/{id}.jpg).';
