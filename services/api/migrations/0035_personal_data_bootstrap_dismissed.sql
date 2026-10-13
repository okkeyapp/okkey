-- Per-member flag: skip auto-creating personal_data after unlock when the user deleted it.

ALTER TABLE workspace_member_item_category_preferences
  ADD COLUMN IF NOT EXISTS personal_data_bootstrap_dismissed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workspace_member_item_category_preferences.personal_data_bootstrap_dismissed IS
  'When true, skip auto-creating personal_data after unlock (user deleted it).';
