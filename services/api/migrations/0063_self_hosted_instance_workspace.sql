-- Self-hosted single-workspace model (product): one instance workspace per install.
--
-- Rules:
-- 1) server_instance_settings.workspace_id is THE instance workspace (nullable until first-run finish).
-- 2) registration_mode is invite_only for every existing row (open registration removed on self-host).
-- 3) Backfill when setup_completed_at IS NOT NULL (self-hosted installs that finished first-run):
--    instance workspace = oldest workspace owned by the oldest user (ORDER BY users.created_at ASC,
--    then workspaces.created_at ASC). Documented product rule from Alex.
-- 4) Delete every other workspace on those installs (beta cleanup of extra Personal workspaces),
--    cascading vaults/items/roles/profiles/memberships via ON DELETE CASCADE.
-- 5) Users who are not members/owners of the instance workspace are blocked and lose sessions.
-- 6) Ensure each remaining instance member has a personal vault row (no key material required).
-- 7) SaaS / unfinished setup (setup_completed_at IS NULL): backfill + deletion are no-ops.
-- Idempotent: safe to re-run after partial apply.

-- Account block flag used when a user loses instance access on self-hosted.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Instance workspace pointer (NULL until first-run finish writes it).
ALTER TABLE server_instance_settings
  ADD COLUMN IF NOT EXISTS workspace_id bigint REFERENCES workspaces(id) ON DELETE RESTRICT;

-- Open registration is no longer a self-host option; force invite_only.
UPDATE server_instance_settings
SET registration_mode = 'invite_only',
    updated_at = now()
WHERE registration_mode IS DISTINCT FROM 'invite_only';

DO $$
DECLARE
  instance_ws bigint;
  setup_done timestamptz;
BEGIN
  SELECT setup_completed_at, workspace_id
  INTO setup_done, instance_ws
  FROM server_instance_settings
  WHERE id = TRUE
  FOR UPDATE;

  -- SaaS and incomplete first-run: leave workspace_id null and keep all workspaces.
  IF setup_done IS NULL THEN
    RETURN;
  END IF;

  IF instance_ws IS NULL THEN
    -- Oldest user, then that user's oldest workspace = the instance workspace.
    SELECT w.id
    INTO instance_ws
    FROM workspaces w
    INNER JOIN users u ON u.id = w.owner_id
    ORDER BY u.created_at ASC, u.id ASC, w.created_at ASC, w.id ASC
    LIMIT 1;

    IF instance_ws IS NULL THEN
      -- Setup marked complete but no workspace exists; leave null (operator must re-run setup).
      RETURN;
    END IF;

    UPDATE server_instance_settings
    SET workspace_id = instance_ws,
        updated_at = now()
    WHERE id = TRUE;
  END IF;

  -- Ensure every current member/owner of the instance workspace has a personal vault row.
  -- No client key material is required for the vault row (same as ensurePersonalVault).
  INSERT INTO vaults (id, workspace_id, name, description, icon, is_personal, owner_id, crypto_version)
  SELECT
    ('x' || substr(md5(random()::text || clock_timestamp()::text || member_user_id::text), 1, 15))::bit(60)::bigint,
    instance_ws,
    'Personal vault',
    '',
    '',
    TRUE,
    member_user_id,
    2
  FROM (
    SELECT w.owner_id AS member_user_id
    FROM workspaces w
    WHERE w.id = instance_ws
    UNION
    SELECT wm.user_id AS member_user_id
    FROM workspace_members wm
    WHERE wm.workspace_id = instance_ws
  ) members
  WHERE NOT EXISTS (
    SELECT 1
    FROM vaults v
    WHERE v.workspace_id = instance_ws
      AND v.is_personal = TRUE
      AND v.owner_id = members.member_user_id
  );

  -- Block users who will lose access (not owner/member of the instance workspace).
  UPDATE users u
  SET blocked_at = COALESCE(u.blocked_at, now()),
      updated_at = now()
  WHERE NOT EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = instance_ws AND w.owner_id = u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = instance_ws AND wm.user_id = u.id
    );

  -- Drop sessions for blocked users (covers unbound bootstrap sessions too).
  DELETE FROM sessions s
  USING users u
  WHERE s.user_id = u.id
    AND u.blocked_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = instance_ws AND w.owner_id = u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = instance_ws AND wm.user_id = u.id
    );

  -- Revoke devices for those users.
  UPDATE devices d
  SET
    status = 'revoked',
    revoked_at = COALESCE(d.revoked_at, now()),
    device_share = NULL
  FROM users u
  WHERE d.user_id = u.id
    AND u.blocked_at IS NOT NULL
    AND d.status IN ('trusted', 'pending', 'blocked')
    AND NOT EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = instance_ws AND w.owner_id = u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = instance_ws AND wm.user_id = u.id
    );

  -- Delete every workspace that is not the instance workspace.
  -- Child tables reference workspaces with ON DELETE CASCADE.
  -- Clear logo_vault_id first to avoid vault FK friction during cascade.
  UPDATE workspaces
  SET logo_vault_id = NULL
  WHERE id IS DISTINCT FROM instance_ws;

  DELETE FROM workspaces
  WHERE id IS DISTINCT FROM instance_ws;
END $$;
