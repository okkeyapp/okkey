-- Members removed without a workspace-key holder wait here for a later rotation.
-- The row records who left. It does not store key material.

CREATE TABLE workspace_key_rotation_queue (
  workspace_id bigint NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  removed_user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, removed_user_id)
);

CREATE INDEX workspace_key_rotation_queue_workspace_idx
  ON workspace_key_rotation_queue (workspace_id, created_at);
