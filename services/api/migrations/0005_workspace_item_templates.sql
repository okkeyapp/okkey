-- Workspace-wide item form templates (shared across members).

CREATE TABLE workspace_item_templates (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_id text NOT NULL,
  payload_json jsonb NOT NULL,
  favicon_id bigint,
  created_by bigint NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspace_item_templates_workspace
  ON workspace_item_templates (workspace_id);

COMMENT ON TABLE workspace_item_templates IS
  'Workspace-shared new-item form templates (structure and pre-filled field values).';

ALTER TABLE workspace_member_item_category_preferences
  ADD COLUMN IF NOT EXISTS favorite_template_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
