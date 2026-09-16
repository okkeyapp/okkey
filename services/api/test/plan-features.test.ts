import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_FEATURE_MATRIX,
  PLAN_FEATURES,
  PLAN_QUOTA_LIMITS,
  PLAN_TIERS,
  getPlanQuotaLimits,
  hasPlanFeature,
  isPlanTier,
  normalizePlanTier,
  planEntitlementOptionsFromWorkspace,
  resolvePlanFeatures,
  sanitizePlanFeatureOverrides,
} from "../../../packages/types/src/plan-features.ts";

test("PLAN_FEATURE_MATRIX covers every tier and feature", () => {
  for (const tier of PLAN_TIERS) {
    for (const feature of PLAN_FEATURES) {
      assert.equal(typeof PLAN_FEATURE_MATRIX[tier][feature], "boolean");
    }
  }
});

test("PLAN_TIERS includes product catalog", () => {
  assert.deepEqual([...PLAN_TIERS], ["FREE", "PREMIUM", "FAMILY", "TEAM", "ENTERPRISE"]);
});

test("hasPlanFeature: FREE baseline (APP.md open-source)", () => {
  assert.equal(hasPlanFeature("FREE", "capsules"), true);
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings"), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceRoles"), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceProfiles"), false);
  assert.equal(hasPlanFeature("FREE", "sharedVaults"), false);
  assert.equal(hasPlanFeature("FREE", "additionalWorkspaceMembers"), false);
  assert.equal(hasPlanFeature("FREE", "paidPlanBadge"), false);
  assert.equal(hasPlanFeature("FREE", "accountRecovery"), false);
  assert.equal(hasPlanFeature("FREE", "trustedContacts"), false);
  assert.equal(hasPlanFeature("FREE", "filesInItems"), false);
  assert.equal(hasPlanFeature("FREE", "monitoring"), false);
  assert.equal(hasPlanFeature("FREE", "storageQuotas"), false);
});

test("hasPlanFeature: PREMIUM personal paid", () => {
  assert.equal(hasPlanFeature("PREMIUM", "capsuleAccessSettings"), true);
  assert.equal(hasPlanFeature("PREMIUM", "filesInItems"), true);
  assert.equal(hasPlanFeature("PREMIUM", "monitoring"), true);
  assert.equal(hasPlanFeature("PREMIUM", "accountRecovery"), true);
  assert.equal(hasPlanFeature("PREMIUM", "trustedContacts"), true);
  assert.equal(hasPlanFeature("PREMIUM", "storageQuotas"), true);
  assert.equal(hasPlanFeature("PREMIUM", "paidPlanBadge"), true);
  assert.equal(hasPlanFeature("PREMIUM", "sharedVaults"), false);
  assert.equal(hasPlanFeature("PREMIUM", "additionalWorkspaceMembers"), false);
  assert.equal(hasPlanFeature("PREMIUM", "customWorkspaceRoles"), false);
  assert.equal(hasPlanFeature("PREMIUM", "customWorkspaceProfiles"), false);
});

test("hasPlanFeature: FAMILY multi-user personal", () => {
  assert.equal(hasPlanFeature("FAMILY", "sharedVaults"), true);
  assert.equal(hasPlanFeature("FAMILY", "additionalWorkspaceMembers"), true);
  assert.equal(hasPlanFeature("FAMILY", "customWorkspaceRoles"), true);
  assert.equal(hasPlanFeature("FAMILY", "customWorkspaceProfiles"), true);
  assert.equal(hasPlanFeature("FAMILY", "accountRecovery"), true);
});

test("hasPlanFeature: TEAM and ENTERPRISE unlock paid gates (regression)", () => {
  for (const tier of ["TEAM", "ENTERPRISE"] as const) {
    assert.equal(hasPlanFeature(tier, "capsules"), true);
    assert.equal(hasPlanFeature(tier, "capsuleAccessSettings"), true);
    assert.equal(hasPlanFeature(tier, "customWorkspaceRoles"), true);
    assert.equal(hasPlanFeature(tier, "customWorkspaceProfiles"), true);
    assert.equal(hasPlanFeature(tier, "sharedVaults"), true);
    assert.equal(hasPlanFeature(tier, "additionalWorkspaceMembers"), true);
    assert.equal(hasPlanFeature(tier, "paidPlanBadge"), true);
    assert.equal(hasPlanFeature(tier, "filesInItems"), true);
    assert.equal(hasPlanFeature(tier, "monitoring"), true);
    assert.equal(hasPlanFeature(tier, "accountRecovery"), true);
    assert.equal(hasPlanFeature(tier, "trustedContacts"), true);
    assert.equal(hasPlanFeature(tier, "storageQuotas"), true);
  }
});

test("normalizePlanTier maps known tiers; fail-closed for unknown", () => {
  assert.equal(normalizePlanTier("ENTERPRISE"), "ENTERPRISE");
  assert.equal(normalizePlanTier("FREE"), "FREE");
  assert.equal(normalizePlanTier("TEAM"), "TEAM");
  assert.equal(normalizePlanTier("PREMIUM"), "PREMIUM");
  assert.equal(normalizePlanTier("FAMILY"), "FAMILY");
  assert.equal(normalizePlanTier(undefined), "FREE");
  assert.equal(normalizePlanTier(null), "FREE");
  assert.equal(normalizePlanTier("CUSTOM"), "FREE");
  assert.equal(normalizePlanTier("legacy"), "FREE");
});

test("isPlanTier", () => {
  assert.equal(isPlanTier("FREE"), true);
  assert.equal(isPlanTier("PREMIUM"), true);
  assert.equal(isPlanTier("FAMILY"), true);
  assert.equal(isPlanTier("TEAM"), true);
  assert.equal(isPlanTier("ENTERPRISE"), true);
  assert.equal(isPlanTier("CUSTOM"), false);
});

test("custom override selectively replaces matrix cells", () => {
  assert.equal(hasPlanFeature("FREE", "monitoring"), false);
  assert.equal(
    hasPlanFeature("FREE", "monitoring", {
      customOverride: true,
      featureOverrides: { monitoring: true },
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "sharedVaults", {
      customOverride: true,
      featureOverrides: { sharedVaults: false },
    }),
    false,
  );
  // Without customOverride flag, overrides are ignored
  assert.equal(
    hasPlanFeature("FREE", "monitoring", {
      customOverride: false,
      featureOverrides: { monitoring: true },
    }),
    false,
  );
});

test("planEntitlementOptionsFromWorkspace + resolvePlanFeatures", () => {
  const options = planEntitlementOptionsFromWorkspace({
    planCustomOverride: true,
    planFeatureOverrides: { filesInItems: true, monitoring: false },
  });
  const features = resolvePlanFeatures("FREE", options);
  assert.equal(features.filesInItems, true);
  assert.equal(features.monitoring, false);
  assert.equal(features.capsules, true);
});

test("sanitizePlanFeatureOverrides ignores unknown keys", () => {
  const sanitized = sanitizePlanFeatureOverrides({
    monitoring: true,
    notAFeature: true,
    capsules: "yes",
  });
  assert.deepEqual(sanitized, { monitoring: true });
});

test("PLAN_QUOTA_LIMITS: FREE zeros; ENTERPRISE unlimited", () => {
  assert.deepEqual(getPlanQuotaLimits("FREE"), {
    maxAdditionalMembers: 0,
    maxSharedVaults: 0,
    maxAttachmentStorageMb: 0,
  });
  assert.deepEqual(PLAN_QUOTA_LIMITS.ENTERPRISE, {
    maxAdditionalMembers: null,
    maxSharedVaults: null,
    maxAttachmentStorageMb: null,
  });
  assert.equal(getPlanQuotaLimits("unknown").maxAdditionalMembers, 0);
});
