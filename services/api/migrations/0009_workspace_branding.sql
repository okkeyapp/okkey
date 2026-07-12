ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS tile_color text,
  ADD COLUMN IF NOT EXISTS logo_vault_id bigint REFERENCES vaults(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logo_attachment_id bigint;

COMMENT ON COLUMN workspaces.tile_color IS 'Hex color for default workspace tile mark when no custom logo is set';
COMMENT ON COLUMN workspaces.logo_vault_id IS 'Vault that stores the encrypted workspace logo attachment';
COMMENT ON COLUMN workspaces.logo_attachment_id IS 'Encrypted logo attachment id in logo_vault_id scope';
