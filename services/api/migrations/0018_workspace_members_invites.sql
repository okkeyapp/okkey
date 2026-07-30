-- Workspace invitations + member audit columns for Members settings.

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS invited_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS role_changed_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_changed_at timestamptz;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_id bigint NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  invited_by_user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT workspace_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT workspace_invitations_email_nonempty CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_token_hash
  ON workspace_invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_pending_email
  ON workspace_invitations (workspace_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace_status
  ON workspace_invitations (workspace_id, status);
