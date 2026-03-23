-- Event log envelope: schema version for ciphertext evolution, optional idempotency, client timestamp.
ALTER TABLE events ADD COLUMN IF NOT EXISTS payload_schema_version integer NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS idempotency_key uuid NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_vault_idempotency ON events (vault_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
