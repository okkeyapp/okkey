-- Per-member capsule access defaults for the create form (non-secret preferences).

CREATE TABLE IF NOT EXISTS workspace_member_capsule_defaults (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capsule_type text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_member_capsule_defaults_type_chk
    CHECK (capsule_type IN ('text', 'file', 'item')),
  UNIQUE (workspace_id, user_id, capsule_type)
);

CREATE INDEX IF NOT EXISTS workspace_member_capsule_defaults_workspace_user_idx
  ON workspace_member_capsule_defaults (workspace_id, user_id);
