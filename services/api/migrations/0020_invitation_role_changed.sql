-- Audit columns for role changes on pending workspace invitations.

ALTER TABLE workspace_invitations
  ADD COLUMN IF NOT EXISTS role_changed_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_changed_at timestamptz;
