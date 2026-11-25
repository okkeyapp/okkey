-- Self-hosted single-workspace model (product): schema for one instance workspace per install.
--
-- DDL (+ one-shot upgrade flag). Data cleanup (pick instance workspace, block non-members,
-- delete extras) runs at API startup when deploymentMode=self_hosted — see
-- ensureSelfHostedInstanceWorkspace. SaaS applies the same columns harmlessly;
-- registration_mode invite_only is required on self-hosted and is a no-op product change
-- on SaaS (SaaS ignores these settings).
-- Idempotent: safe to re-run after partial apply.

-- Account block flag used when a user loses instance access on self-hosted.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Instance workspace pointer (NULL until first-run finish or startup cleanup writes it).
ALTER TABLE server_instance_settings
  ADD COLUMN IF NOT EXISTS workspace_id bigint REFERENCES workspaces(id) ON DELETE RESTRICT;

-- One-shot flag: beta.3 upgrades have users before 0063 runs while setup is incomplete.
-- Fresh installs have no users at migration time, so the flag stays FALSE and an API
-- restart mid-wizard does not treat the catalog as a legacy upgrade.
ALTER TABLE server_instance_settings
  ADD COLUMN IF NOT EXISTS legacy_upgrade_pending boolean NOT NULL DEFAULT FALSE;

UPDATE server_instance_settings
SET legacy_upgrade_pending = TRUE,
    updated_at = now()
WHERE setup_completed_at IS NULL
  AND workspace_id IS NULL
  AND EXISTS (SELECT 1 FROM users);

-- Open registration is no longer a self-host option; force invite_only.
UPDATE server_instance_settings
SET registration_mode = 'invite_only',
    updated_at = now()
WHERE registration_mode IS DISTINCT FROM 'invite_only';
