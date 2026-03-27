-- Vault-level crypto profile (anti-downgrade). New vaults default to v2; existing rows
-- backfill from MAX(events.payload_schema_version) or 2 when the vault has no events yet.

ALTER TABLE vaults ADD COLUMN crypto_version smallint;

UPDATE vaults v
SET crypto_version = COALESCE(
  (SELECT MAX(e.payload_schema_version) FROM events e WHERE e.vault_id = v.id),
  2
);

ALTER TABLE vaults ALTER COLUMN crypto_version SET NOT NULL;

ALTER TABLE vaults ADD CONSTRAINT vaults_crypto_version_check
  CHECK (crypto_version >= 1 AND crypto_version <= 65535);
