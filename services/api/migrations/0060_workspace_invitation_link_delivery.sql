-- Link-only workspace invitations: no email required, independent of outbound mail.

ALTER TABLE workspace_invitations
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'email';

ALTER TABLE workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_delivery_method_check;

ALTER TABLE workspace_invitations
  ADD CONSTRAINT workspace_invitations_delivery_method_check
    CHECK (delivery_method IN ('email', 'link'));

ALTER TABLE workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_email_nonempty;

ALTER TABLE workspace_invitations
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_email_channel_check;

ALTER TABLE workspace_invitations
  ADD CONSTRAINT workspace_invitations_email_channel_check
    CHECK (
      (
        delivery_method = 'email'
        AND email IS NOT NULL
        AND length(trim(email)) > 0
      )
      OR (
        delivery_method = 'link'
        AND email IS NULL
      )
    );

DROP INDEX IF EXISTS idx_workspace_invitations_pending_email;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_pending_email
  ON workspace_invitations (workspace_id, lower(email))
  WHERE status = 'pending' AND email IS NOT NULL;
