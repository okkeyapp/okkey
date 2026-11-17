-- Track whether a pending workspace invitation email has been delivered yet.
-- Existing rows default to 'sent' (historical invites were emailed or logger-acked).

ALTER TABLE workspace_invitations
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent';

ALTER TABLE workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_delivery_status_check;

ALTER TABLE workspace_invitations
  ADD CONSTRAINT workspace_invitations_delivery_status_check
    CHECK (delivery_status IN ('pending', 'sent'));

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_pending_delivery
  ON workspace_invitations (delivery_status, expires_at)
  WHERE status = 'pending' AND delivery_status = 'pending';
