-- Per-member flag: skip auto-creating personal_data after unlock when the user
-- deleted it (or when the account pre-dates this migration).
--
-- Legacy backfill: every workspace member that already exists when this migration
-- runs is marked dismissed. Bootstrap then runs only for accounts/members created
-- after this migration. That prevents recreating personal_data for users who
-- deleted it on older clients before the server flag existed (purge left no row
-- and no dismiss marker).

ALTER TABLE workspace_member_item_category_preferences
  ADD COLUMN IF NOT EXISTS personal_data_bootstrap_dismissed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workspace_member_item_category_preferences.personal_data_bootstrap_dismissed IS
  'When true, skip auto-creating personal_data after unlock (deleted or legacy member).';

-- Existing preference rows: treat as already bootstrapped / dismissed.
UPDATE workspace_member_item_category_preferences
SET personal_data_bootstrap_dismissed = true
WHERE personal_data_bootstrap_dismissed IS NOT TRUE;

-- Existing members without a preferences row: insert dismissed=true with default favorites
-- so GET does not fall back to dismissed=false (virtual defaults for missing rows).
INSERT INTO workspace_member_item_category_preferences (
  id,
  workspace_id,
  user_id,
  favorite_category_ids,
  favorite_template_ids,
  favorite_order,
  personal_data_bootstrap_dismissed
)
SELECT
  wm.id,
  wm.workspace_id,
  wm.user_id,
  '["login","secure_note","credit_card","personal_data","passport","secure_files"]'::jsonb,
  '[]'::jsonb,
  '["category:login","category:secure_note","category:credit_card","category:personal_data","category:passport","category:secure_files"]'::jsonb,
  true
FROM workspace_members wm
WHERE NOT EXISTS (
  SELECT 1
  FROM workspace_member_item_category_preferences p
  WHERE p.workspace_id = wm.workspace_id
    AND p.user_id = wm.user_id
)
ON CONFLICT DO NOTHING;
