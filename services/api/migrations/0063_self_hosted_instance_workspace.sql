-- Self-hosted single-workspace model (product): schema for one instance workspace per install.
--
-- DDL only. Data cleanup (pick instance workspace, block non-members, delete extras) runs
-- at API startup when deploymentMode=self_hosted — see ensureSelfHostedInstanceWorkspace.
-- SaaS applies the same columns harmlessly; registration_mode invite_only is required on
-- self-hosted and is a no-op product change on SaaS (SaaS ignores these settings).
-- Idempotent: safe to re-run after partial apply.

-- Account block flag used when a user loses instance access on self-hosted.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Instance workspace pointer (NULL until first-run finish or startup cleanup writes it).
ALTER TABLE server_instance_settings
  ADD COLUMN IF NOT EXISTS workspace_id bigint REFERENCES workspaces(id) ON DELETE RESTRICT;

-- Open registration is no longer a self-host option; force invite_only.
UPDATE server_instance_settings
SET registration_mode = 'invite_only',
    updated_at = now()
WHERE registration_mode IS DISTINCT FROM 'invite_only';
