-- Vault display metadata for settings UI (emoji icon + description).
ALTER TABLE vaults
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '';
