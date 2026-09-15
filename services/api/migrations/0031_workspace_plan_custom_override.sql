-- Plan entitlements foundation: custom / “by request” overrides + document catalog tiers.
-- Existing ENTERPRISE rows are intentionally left unchanged (still the top catalog tier).

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS plan_custom_override boolean NOT NULL DEFAULT false;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS plan_feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN workspaces.plan_tier IS
  'Catalog commercial tier: FREE | PREMIUM | FAMILY | TEAM | ENTERPRISE. Existing ENTERPRISE rows stay ENTERPRISE (no remapping). Custom selective features use plan_custom_override + plan_feature_overrides.';

COMMENT ON COLUMN workspaces.plan_custom_override IS
  'When true, plan_feature_overrides selectively replace PLAN_FEATURE_MATRIX cells (APP.md “by request” plan). Catalog plan_tier remains for display/billing.';

COMMENT ON COLUMN workspaces.plan_feature_overrides IS
  'Sparse JSON object of PlanFeature → boolean. Applied only when plan_custom_override is true.';
