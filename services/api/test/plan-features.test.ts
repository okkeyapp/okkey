import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_FEATURE_MATRIX,
  PLAN_FEATURES,
  PLAN_QUOTA_LIMITS,
  PLAN_TIERS,
  getPlanQuotaLimits,
  hasPlanFeature,
  planFeatureAccess,
  planFeatureWriteDecision,
  resolveWorkspaceStorageLimitMb,
  storageWriteExceedsQuota,
  STORAGE_QUOTA_BYTES_PER_MIB,
  isPlanTier,
  isSelfHostedEnterpriseLicenseLapsed,
  normalizePlanTier,
  planEntitlementOptionsFromWorkspace,
  planFeatureReadable,
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
  assert.equal(hasPlanFeature("FREE", "storageQuotas"), true);
  assert.equal(
    hasPlanFeature("FREE", "storageQuotas", { deploymentMode: "saas" }),
    true,
  );
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

test("PLAN_QUOTA_LIMITS: catalog seats stay; storage ceilings are fixed or per member", () => {
  assert.deepEqual(getPlanQuotaLimits("FREE"), {
    maxAdditionalMembers: 3,
    maxSharedVaults: 1,
    maxAttachmentStorageMb: 0,
    storageQuota: { baseMb: 100, perMemberMb: 0 },
  });
  assert.deepEqual(getPlanQuotaLimits("PREMIUM"), {
    maxAdditionalMembers: 10,
    maxSharedVaults: 1,
    maxAttachmentStorageMb: 5 * 1024,
    storageQuota: { baseMb: 5 * 1024, perMemberMb: 0 },
  });
  assert.deepEqual(getPlanQuotaLimits("TEAM"), {
    maxAdditionalMembers: 25,
    maxSharedVaults: 5,
    maxAttachmentStorageMb: 100 * 1024,
    storageQuota: { baseMb: 5 * 1024, perMemberMb: 5 * 1024 },
  });
  assert.deepEqual(PLAN_QUOTA_LIMITS.ENTERPRISE, {
    maxAdditionalMembers: null,
    maxSharedVaults: null,
    maxAttachmentStorageMb: null,
    storageQuota: { baseMb: 5 * 1024, perMemberMb: 5 * 1024 },
  });
  assert.equal(getPlanQuotaLimits("unknown").maxAdditionalMembers, 3);
  assert.equal(getPlanQuotaLimits("unknown").storageQuota.baseMb, 100);
  assert.deepEqual(getPlanQuotaLimits("FAMILY"), getPlanQuotaLimits("PREMIUM"));
});

test("self_hosted entitlements ignore plan_tier: modules off → FREE; modules on → ENTERPRISE", () => {
  for (const planTier of ["FREE", "PREMIUM", "TEAM", "ENTERPRISE", "FAMILY", null, "unknown"]) {
    assert.equal(
      resolveEntitlementPlanTier(planTier, {
        deploymentMode: "self_hosted",
        enterpriseModulesActive: false,
      }),
      "FREE",
      String(planTier),
    );
    assert.equal(
      resolveEntitlementPlanTier(planTier, {
        deploymentMode: "self_hosted",
        enterpriseModulesActive: true,
      }),
      "ENTERPRISE",
      String(planTier),
    );
    assert.equal(
      isSelfHostedEnterpriseLicenseLapsed({
        deploymentMode: "self_hosted",
        enterpriseModulesActive: true,
      }),
      false,
    );
  }
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
    hasPlanFeature("FREE", "storageQuotas", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "storageQuotas", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("FREE", "storageQuotas", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "storageQuotas", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("FREE", "monitoring", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
  );
  const modulesOn = {
    deploymentMode: "self_hosted" as const,
    enterpriseModulesActive: true,
  };
  for (const feature of [
    "capsuleAccessSettings",
    "customWorkspaceRoles",
    "customWorkspaceProfiles",
    "accountRecovery",
    "trustedContacts",
    "monitoring",
  ] as const) {
    assert.equal(planFeatureAccess("FREE", feature, modulesOn), "granted", feature);
    assert.equal(planFeatureAccess("ENTERPRISE", feature, modulesOn), "granted", feature);
    const write = planFeatureWriteDecision("FREE", feature, modulesOn);
    assert.equal(write.allowed, true, feature);
  }
  assert.equal(planFeatureAccess("FREE", "sharedVaults", modulesOn), "granted");
  assert.equal(planFeatureAccess("FREE", "customWorkspaceRoles", {
    deploymentMode: "self_hosted",
    enterpriseModulesActive: false,
  }), "unavailable");
  assert.equal(planFeatureAccess("ENTERPRISE", "customWorkspaceRoles", {
    deploymentMode: "self_hosted",
    enterpriseModulesActive: false,
  }), "unavailable");
  assert.equal(planFeatureAccess("FREE", "customWorkspaceRoles"), "unavailable");
  assert.equal(planFeatureAccess("ENTERPRISE", "monitoring", modulesOn), "granted");
  const missingWrite = planFeatureWriteDecision("FREE", "customWorkspaceRoles");
  assert.equal(missingWrite.allowed, false);
  if (!missingWrite.allowed) {
    assert.equal(missingWrite.code, "PLAN_FEATURE_REQUIRED");
    assert.equal(missingWrite.status, 403);
  }
  assert.equal(
    hasPlanFeature("FREE", "customWorkspaceRoles", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
  );
  assert.equal(
    hasPlanFeature("PREMIUM", "customWorkspaceRoles", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }),
    false,
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "monitoring", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }),
    true,
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
    getPlanQuotaLimits("FREE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }).maxSharedVaults,
    null,
  );
  assert.equal(
    getPlanQuotaLimits("TEAM", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
    }).maxSharedVaults,
    1,
  );
  assert.equal(
    getPlanQuotaLimits("ENTERPRISE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }).maxAdditionalMembers,
    null,
  );
});

test("storage ceiling: self-host none; SaaS FREE 100; PREMIUM 5120; TEAM/ENTERPRISE per member", () => {
  assert.equal(
    getPlanQuotaLimits("FREE", { deploymentMode: "self_hosted", enterpriseModulesActive: false })
      .storageQuota.baseMb,
    null,
  );
  assert.equal(
    getPlanQuotaLimits("ENTERPRISE", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: true,
    }).storageQuota.baseMb,
    null,
  );
  assert.equal(
    getPlanQuotaLimits("PREMIUM", { deploymentMode: "self_hosted", enterpriseModulesActive: false })
      .maxAttachmentStorageMb,
    0,
  );
  assert.equal(
    resolveWorkspaceStorageLimitMb(getPlanQuotaLimits("FREE", { deploymentMode: "saas" }).storageQuota, 4),
    100,
  );
  assert.equal(
    resolveWorkspaceStorageLimitMb(
      getPlanQuotaLimits("PREMIUM", { deploymentMode: "saas" }).storageQuota,
      1,
    ),
    5120,
  );
  assert.equal(
    resolveWorkspaceStorageLimitMb(getPlanQuotaLimits("TEAM", { deploymentMode: "saas" }).storageQuota, 3),
    5120 * 3 + 5120,
  );
  assert.equal(
    resolveWorkspaceStorageLimitMb(
      getPlanQuotaLimits("ENTERPRISE", { deploymentMode: "saas" }).storageQuota,
      0,
    ),
    5120 + 5120,
  );
  assert.equal(
    resolveWorkspaceStorageLimitMb(
      getPlanQuotaLimits("FAMILY", { deploymentMode: "saas" }).storageQuota,
      6,
    ),
    5120,
  );
  const limitBytes = 100 * STORAGE_QUOTA_BYTES_PER_MIB;
  assert.equal(
    storageWriteExceedsQuota({ limitBytes, usedBytes: limitBytes, additionalBytes: 0 }),
    false,
  );
  assert.equal(
    storageWriteExceedsQuota({ limitBytes, usedBytes: limitBytes - 10, additionalBytes: 10 }),
    false,
  );
  assert.equal(
    storageWriteExceedsQuota({ limitBytes, usedBytes: limitBytes, additionalBytes: 1 }),
    true,
  );
  assert.equal(
    storageWriteExceedsQuota({
      limitBytes,
      usedBytes: limitBytes,
      additionalBytes: 20,
      replacedBytes: 20,
    }),
    false,
  );
  assert.equal(
    storageWriteExceedsQuota({ limitBytes: null, usedBytes: limitBytes, additionalBytes: limitBytes }),
    false,
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
  assert.equal(
    resolveEntitlementPlanTier("FREE", {
      deploymentMode: "saas",
      enterpriseModulesActive: true,
      enterpriseLicenseLapsed: true,
    }),
    "FREE",
  );
  assert.equal(
    resolveEntitlementPlanTier("ENTERPRISE", {
      deploymentMode: "saas",
      enterpriseModulesActive: false,
    }),
    "ENTERPRISE",
  );
  assert.equal(
    hasPlanFeature("FREE", "monitoring", {
      deploymentMode: "saas",
      enterpriseModulesActive: true,
    }),
    false,
  );
  assert.equal(
    planFeatureAccess("FREE", "monitoring", {
      deploymentMode: "saas",
      enterpriseModulesActive: true,
      enterpriseLicenseLapsed: true,
    }),
    "unavailable",
  );
  assert.equal(
    hasPlanFeature("ENTERPRISE", "customWorkspaceRoles", {
      deploymentMode: "saas",
      enterpriseModulesActive: false,
    }),
    true,
  );
});

test("self_hosted license lapse is a license signal, not plan_tier", () => {
  const lapsed = {
    deploymentMode: "self_hosted" as const,
    enterpriseModulesActive: true,
    enterpriseLicenseLapsed: true,
  };
  for (const planTier of ["FREE", "PREMIUM", "TEAM", "ENTERPRISE"]) {
    assert.equal(isSelfHostedEnterpriseLicenseLapsed(lapsed), true);
    assert.equal(resolveEntitlementPlanTier(planTier, lapsed), "FREE");
    assert.equal(planFeatureAccess(planTier, "customWorkspaceRoles", lapsed), "lapsed");
    assert.equal(planFeatureAccess(planTier, "monitoring", lapsed), "lapsed");
    assert.equal(planFeatureReadable(planTier, "monitoring", lapsed), true);
    assert.equal(planFeatureAccess(planTier, "sharedVaults", lapsed), "granted");
    assert.equal(hasPlanFeature(planTier, "customWorkspaceRoles", lapsed), false);
    const write = planFeatureWriteDecision(planTier, "accountRecovery", lapsed);
    assert.equal(write.allowed, false);
    if (!write.allowed) {
      assert.equal(write.code, "PLAN_LICENSE_LAPSED");
      assert.equal(write.status, 402);
    }
    assert.equal(getPlanQuotaLimits(planTier, lapsed).maxAdditionalMembers, 10);
    assert.equal(getPlanQuotaLimits(planTier, lapsed).maxSharedVaults, 1);
  }
  assert.equal(
    planFeatureAccess("ENTERPRISE", "monitoring", {
      ...lapsed,
      customOverride: true,
      featureOverrides: { monitoring: true },
    }),
    "granted",
  );
  assert.equal(
    isSelfHostedEnterpriseLicenseLapsed({
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
      enterpriseLicenseLapsed: true,
    }),
    false,
  );
  assert.equal(
    planFeatureAccess("FREE", "customWorkspaceRoles", {
      deploymentMode: "self_hosted",
      enterpriseModulesActive: false,
      enterpriseLicenseLapsed: true,
    }),
    "unavailable",
  );
  const missingWrite = planFeatureWriteDecision("FREE", "customWorkspaceRoles");
  assert.equal(missingWrite.allowed, false);
  if (!missingWrite.allowed) {
    assert.equal(missingWrite.code, "PLAN_FEATURE_REQUIRED");
    assert.equal(missingWrite.status, 403);
  }
});
