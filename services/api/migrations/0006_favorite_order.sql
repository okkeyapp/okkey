ALTER TABLE workspace_member_item_category_preferences
  ADD COLUMN IF NOT EXISTS favorite_order jsonb NOT NULL DEFAULT '[]'::jsonb;
