-- Workspace-level capsule admin policies (JSON object).

ALTER TABLE workspaces
  ADD COLUMN capsule_policies jsonb NOT NULL DEFAULT '{
    "allow_mode": "all",
    "allow_member_ids": [],
    "force_max_views": 0,
    "require_time_deactivation": false,
    "require_access": false,
    "access_audience": "all_users",
    "require_password": false,
    "password_attempt_limit": 0,
    "require_approval": false
  }'::jsonb;

COMMENT ON COLUMN workspaces.capsule_policies IS
  'Admin policies for capsules: allow mode, forced limits, required advanced settings.';
