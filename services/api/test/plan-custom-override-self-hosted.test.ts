/**
 * OKKEYAPP-230: self-hosted `plan_custom_override` flips feature flags
 * without changing the modules-off quotas (10 additional members, 1 shared vault).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { getPlanQuotaLimits, hasPlanFeature, type PlanEntitlementOptions } from "@okkey/types";
import { workspaceGetPlanQuotaLimits } from "../src/plan-entitlements.ts";

const modulesOff: PlanEntitlementOptions = {
  deploymentMode: "self_hosted",
  enterpriseModulesActive: false,
};

const modulesOn: PlanEntitlementOptions = {
  deploymentMode: "self_hosted",
  enterpriseModulesActive: true,
};

test("self-hosted FREE override can enable monitoring and disable filesInItems", () => {
  assert.equal(hasPlanFeature("FREE", "monitoring", modulesOff), false);
  assert.equal(hasPlanFeature("ENTERPRISE", "monitoring", modulesOff), false);
  assert.equal(hasPlanFeature("FREE", "filesInItems", modulesOff), true);

  const enableMonitoring: PlanEntitlementOptions = {
    ...modulesOff,
    customOverride: true,
    featureOverrides: { monitoring: true },
  };
  assert.equal(hasPlanFeature("FREE", "monitoring", enableMonitoring), true);
  assert.equal(hasPlanFeature("ENTERPRISE", "monitoring", enableMonitoring), true);
  assert.equal(hasPlanFeature("FREE", "filesInItems", enableMonitoring), true);
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings", enableMonitoring), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceRoles", enableMonitoring), false);

  const disableFiles: PlanEntitlementOptions = {
    ...modulesOff,
    customOverride: true,
    featureOverrides: { filesInItems: false, filesInCapsules: false },
  };
  assert.equal(hasPlanFeature("FREE", "filesInItems", disableFiles), false);
  assert.equal(hasPlanFeature("FREE", "filesInCapsules", disableFiles), false);
  assert.equal(hasPlanFeature("PREMIUM", "filesInItems", disableFiles), false);
  assert.equal(hasPlanFeature("FREE", "capsules", disableFiles), true);
  assert.equal(hasPlanFeature("FREE", "monitoring", disableFiles), false);

  assert.equal(
    hasPlanFeature("FREE", "monitoring", {
      ...modulesOff,
      customOverride: false,
      featureOverrides: { monitoring: true },
    }),
    false,
  );
});

test("self-hosted ENTERPRISE override can turn flags on and off over the modules-on matrix", () => {
  assert.equal(hasPlanFeature("FREE", "monitoring", modulesOn), false);
  assert.equal(hasPlanFeature("FREE", "filesInItems", modulesOn), true);
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings", modulesOn), false);
  assert.equal(hasPlanFeature("ENTERPRISE", "monitoring", modulesOn), true);
  assert.equal(hasPlanFeature("ENTERPRISE", "capsuleAccessSettings", modulesOn), true);

  const disablePaid: PlanEntitlementOptions = {
    ...modulesOn,
    customOverride: true,
    featureOverrides: {
      monitoring: false,
      filesInItems: false,
      capsuleAccessSettings: false,
    },
  };
  assert.equal(hasPlanFeature("FREE", "monitoring", disablePaid), false);
  assert.equal(hasPlanFeature("ENTERPRISE", "filesInItems", disablePaid), false);
  assert.equal(hasPlanFeature("TEAM", "capsuleAccessSettings", disablePaid), false);
  assert.equal(hasPlanFeature("FREE", "capsules", disablePaid), true);
  assert.equal(hasPlanFeature("FREE", "sharedVaults", disablePaid), true);

  const enableOnlyMonitoring: PlanEntitlementOptions = {
    ...modulesOn,
    customOverride: true,
    featureOverrides: { customWorkspaceProfiles: false },
  };
  assert.equal(hasPlanFeature("FREE", "customWorkspaceProfiles", enableOnlyMonitoring), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceRoles", enableOnlyMonitoring), false);
  assert.equal(hasPlanFeature("FREE", "monitoring", enableOnlyMonitoring), false);
  assert.equal(hasPlanFeature("ENTERPRISE", "customWorkspaceRoles", enableOnlyMonitoring), true);
  assert.equal(hasPlanFeature("ENTERPRISE", "monitoring", enableOnlyMonitoring), true);

  const grantLapsed: PlanEntitlementOptions = {
    ...modulesOn,
    customOverride: true,
    featureOverrides: { monitoring: true },
  };
  assert.equal(hasPlanFeature("FREE", "monitoring", grantLapsed), true);
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings", grantLapsed), false);
});

test("self-hosted feature overrides do not change the 10/1 quotas", () => {
  for (const planTier of ["FREE", "PREMIUM", "TEAM", "ENTERPRISE"] as const) {
    const limits = getPlanQuotaLimits(planTier, modulesOff);
    assert.equal(limits.maxAdditionalMembers, 10, planTier);
    assert.equal(limits.maxSharedVaults, 1, planTier);
  }

  const fromWorkspace = workspaceGetPlanQuotaLimits(
    { deploymentMode: "self_hosted", enterpriseModulesEnabled: false },
    {
      planTier: "ENTERPRISE",
      planCustomOverride: true,
      planFeatureOverrides: {
        monitoring: true,
        filesInItems: false,
        sharedVaults: false,
        additionalWorkspaceMembers: false,
      },
    },
  );
  assert.equal(fromWorkspace.maxAdditionalMembers, 10);
  assert.equal(fromWorkspace.maxSharedVaults, 1);

  const modulesOnQuotas = workspaceGetPlanQuotaLimits(
    { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
    {
      planTier: "FREE",
      planCustomOverride: true,
      planFeatureOverrides: { sharedVaults: false, additionalWorkspaceMembers: false },
    },
  );
  assert.equal(modulesOnQuotas.maxAdditionalMembers, 10);
  assert.equal(modulesOnQuotas.maxSharedVaults, 1);
});
