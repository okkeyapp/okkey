-- Retire catalog tier FAMILY.
-- Stored rows become PREMIUM. plan_custom_override and plan_feature_overrides are not modified.
-- plan_tier is plain text (no enum or check constraint), so there is no allowed-value list to alter.

UPDATE workspaces
SET
  plan_tier = 'PREMIUM',
  updated_at = now()
WHERE plan_tier = 'FAMILY';

COMMENT ON COLUMN workspaces.plan_tier IS
  'Catalog commercial tier: FREE | PREMIUM | TEAM | ENTERPRISE. Legacy FAMILY rows are rewritten to PREMIUM. Custom selective features use plan_custom_override + plan_feature_overrides.';
