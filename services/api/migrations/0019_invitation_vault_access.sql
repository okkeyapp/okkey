-- Staged vault profile assignments for pending workspace invitations.
-- Applied as real vault_profiles (+ key wraps) when the invite is accepted.

CREATE TABLE IF NOT EXISTS workspace_invitation_vault_access (
  invitation_id bigint NOT NULL REFERENCES workspace_invitations(id) ON DELETE CASCADE,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  profile_id bigint NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  PRIMARY KEY (invitation_id, vault_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitation_vault_access_vault
  ON workspace_invitation_vault_access (vault_id);
