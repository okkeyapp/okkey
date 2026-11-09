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
  resolveEntitlementPlanTier,
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
  assert.deepEqual([...PLAN_TIERS], ["FREE", "PREMIUM", "TEAM", "ENTERPRISE"]);
});

test("hasPlanFeature: FREE baseline", () => {
  assert.equal(hasPlanFeature("FREE", "capsules"), true);
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings"), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceRoles"), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceProfiles"), false);
  assert.equal(hasPlanFeature("FREE", "sharedVaults"), true);
  assert.equal(hasPlanFeature("FREE", "additionalWorkspaceMembers"), true);
  assert.equal(hasPlanFeature("FREE", "paidPlanBadge"), false);
  assert.equal(hasPlanFeature("FREE", "accountRecovery"), false);
  assert.equal(hasPlanFeature("FREE", "trustedContacts"), false);
  assert.equal(hasPlanFeature("FREE", "filesInItems"), false);
  assert.equal(hasPlanFeature("FREE", "filesInCapsules"), false);
  assert.equal(hasPlanFeature("FREE", "monitoring"), false);
  assert.equal(hasPlanFeature("FREE", "storageQuotas"), false);
});

test("hasPlanFeature: PREMIUM personal paid", () => {
  assert.equal(hasPlanFeature("PREMIUM", "capsuleAccessSettings"), false);
  assert.equal(hasPlanFeature("PREMIUM", "filesInItems"), true);
  assert.equal(hasPlanFeature("PREMIUM", "filesInCapsules"), true);
  assert.equal(hasPlanFeature("PREMIUM", "monitoring"), true);
  assert.equal(hasPlanFeature("PREMIUM", "accountRecovery"), true);
  assert.equal(hasPlanFeature("PREMIUM", "trustedContacts"), true);
  assert.equal(hasPlanFeature("PREMIUM", "storageQuotas"), true);
  assert.equal(hasPlanFeature("PREMIUM", "paidPlanBadge"), true);
  assert.equal(hasPlanFeature("PREMIUM", "sharedVaults"), true);
  assert.equal(hasPlanFeature("PREMIUM", "additionalWorkspaceMembers"), true);
  assert.equal(hasPlanFeature("PREMIUM", "customWorkspaceRoles"), false);
  assert.equal(hasPlanFeature("PREMIUM", "customWorkspaceProfiles"), false);
});

test("hasPlanFeature: legacy FAMILY reads as PREMIUM", () => {
  assert.equal(hasPlanFeature("FAMILY", "sharedVaults"), true);
  assert.equal(hasPlanFeature("FAMILY", "additionalWorkspaceMembers"), true);
  assert.equal(hasPlanFeature("FAMILY", "filesInItems"), true);
  assert.equal(hasPlanFeature("FAMILY", "filesInCapsules"), true);
  assert.equal(hasPlanFeature("FAMILY", "monitoring"), true);
  assert.equal(hasPlanFeature("FAMILY", "accountRecovery"), true);
  assert.equal(hasPlanFeature("FAMILY", "customWorkspaceRoles"), false);
  assert.equal(hasPlanFeature("FAMILY", "customWorkspaceProfiles"), false);
  assert.equal(hasPlanFeature("FAMILY", "capsuleAccessSettings"), false);
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
    assert.equal(hasPlanFeature(tier, "filesInCapsules"), true);
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
  assert.equal(normalizePlanTier("FAMILY"), "PREMIUM");
  assert.equal(normalizePlanTier(undefined), "FREE");
  assert.equal(normalizePlanTier(null), "FREE");
  assert.equal(normalizePlanTier("CUSTOM"), "FREE");
  assert.equal(normalizePlanTier("legacy"), "FREE");
});

test("isPlanTier", () => {
  assert.equal(isPlanTier("FREE"), true);
  assert.equal(isPlanTier("PREMIUM"), true);
  assert.equal(isPlanTier("FAMILY"), false);
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

test("PLAN_QUOTA_LIMITS: SaaS catalog seats and shared vaults; ENTERPRISE unlimited", () => {
  assert.deepEqual(getPlanQuotaLimits("FREE"), {
    maxAdditionalMembers: 3,
    maxSharedVaults: 1,
    maxAttachmentStorageMb: 0,
  });
  assert.deepEqual(getPlanQuotaLimits("PREMIUM"), {
    maxAdditionalMembers: 10,
    maxSharedVaults: 1,
    maxAttachmentStorageMb: 5 * 1024,
  });
  assert.deepEqual(getPlanQuotaLimits("TEAM"), {
    maxAdditionalMembers: 25,
    maxSharedVaults: 5,
    maxAttachmentStorageMb: 100 * 1024,
  });
  assert.deepEqual(PLAN_QUOTA_LIMITS.ENTERPRISE, {
    maxAdditionalMembers: null,
    maxSharedVaults: null,
    maxAttachmentStorageMb: null,
  });
  assert.equal(getPlanQuotaLimits("unknown").maxAdditionalMembers, 3);
  assert.deepEqual(getPlanQuotaLimits("FAMILY"), getPlanQuotaLimits("PREMIUM"));
});

test("self_hosted entitlements: modules off → FREE; modules on → ENTERPRISE (ignore plan_tier)", () => {
  assert.equal(
    resolveEntitlementPlanTier("ENTERPRISE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    "FREE",
  );
  assert.equal(
    resolveEntitlementPlanTier("FREE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    "ENTERPRISE",
  );
  assert.equal(
    resolveEntitlementPlanTier("ENTERPRISE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    "ENTERPRISE",
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "sharedVaults", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "customWorkspaceRoles", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("FREE", "monitoring", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("FREE", "sharedVaults", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "sharedVaults", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("FREE", "filesInItems", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("FREE", "filesInCapsules", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "filesInCapsules", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("FREE", "filesInItems", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "filesInItems", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    true,
  );
  assert.equal(
    getPlanQuotaLimits("ENTERPRISE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }).maxAdditionalMembers,
    10,
  );
  assert.equal(
    getPlanQuotaLimits("FREE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }).maxSharedVaults,
    1,
  );
  assert.equal(
    getPlanQuotaLimits("FREE", {
      deploymentMode: "saas",
    }).maxAdditionalMembers,
    3,
  );
  assert.equal(
    getPlanQuotaLimits("FREE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }).maxAdditionalMembers,
    null,
  );
  assert.equal(
    getPlanQuotaLimits("ENTERPRISE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }).maxAdditionalMembers,
    null,
  );
});

test("saas entitlements still use plan_tier", () => {
  assert.equal(
    hasPlanFeature("FREE", "filesInItems", {
      deploymentMode: "saas",
      enterpriseModulesActive: false,
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("FREE", "filesInCapsules", {
      deploymentMode: "saas",
      enterpriseModulesActive: false,
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("PREMIUM", "filesInCapsules", {
      deploymentMode: "saas",
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("FREE", "sharedVaults", {
      deploymentMode: "saas",
      enterpriseModulesActive: true,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("FREE", "capsuleAccessSettings", {
      deploymentMode: "saas",
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("PREMIUM", "capsuleAccessSettings", {
      deploymentMode: "saas",
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("TEAM", "capsuleAccessSettings", {
      deploymentMode: "saas",
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "sharedVaults", {
      deploymentMode: "saas",
      enterpriseModulesActive: false,
    }),
    true,
  );
  assert.equal(resolveEntitlementPlanTier("TEAM", { deploymentMode: "saas" }), "TEAM");
});
