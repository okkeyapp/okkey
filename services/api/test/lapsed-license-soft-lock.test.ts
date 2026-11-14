/**
 * TSK-275 (continues TSK-245): soft-lock decisions when an enterprise license lapses.
 *
 * Nothing in the API sets `enterpriseLicenseLapsed`. These tests pass that option
 * into the entitlement functions. Route helpers are asserted separately so a lapse
 * flag cannot be confused with `workspaces.plan_tier`.
 *
 * QA 2.14 is not in this repository. Shared-vault item list/update/delete are not
 * plan-gated (`SyncService.listEvents`, `SyncService.prepareAppend`). The only item
 * plan gate is ITEM_CREATE, and it follows `sharedVaults`, which stays granted.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTERPRISE_MODULE_FEATURES,
  PLAN_LICENSE_LAPSED,
  getPlanQuotaLimits,
  hasPlanFeature,
  isSelfHostedEnterpriseLicenseLapsed,
  planFeatureAccess,
  planFeatureReadable,
  planFeatureWriteDecision,
  resolveEntitlementPlanTier,
  type PlanFeature,
} from "../../../packages/types/src/plan-features.ts";
import { evaluateSharedVaultItemCreateGate } from "../src/sync/shared-vault-item-create-gate.ts";
import {
  workspaceGetPlanQuotaLimits,
  workspacePlanEntitlementOptions,
  workspacePlanFeatureWriteDecision,
} from "../src/plan-entitlements.ts";

const STORED_TIERS = ["FREE", "PREMIUM", "TEAM", "ENTERPRISE", "FAMILY", null] as const;

const lapsedSelfHost = {
  deploymentMode: "self_hosted" as const,
  enterpriseModulesActive: true,
  enterpriseLicenseLapsed: true,
};

const coreFeatures = [
  "sharedVaults",
  "additionalWorkspaceMembers",
  "capsules",
  "filesInItems",
  "filesInCapsules",
] as const satisfies readonly PlanFeature[];

test("lapsed self-host keeps shared vaults and invites granted and lapses only enterprise modules", () => {
  for (const planTier of STORED_TIERS) {
    assert.equal(isSelfHostedEnterpriseLicenseLapsed(lapsedSelfHost), true, String(planTier));
    assert.equal(resolveEntitlementPlanTier(planTier, lapsedSelfHost), "FREE", String(planTier));

    for (const feature of coreFeatures) {
      assert.equal(planFeatureAccess(planTier, feature, lapsedSelfHost), "granted", feature);
      assert.equal(planFeatureReadable(planTier, feature, lapsedSelfHost), true, feature);
      assert.equal(hasPlanFeature(planTier, feature, lapsedSelfHost), true, feature);
      const write = planFeatureWriteDecision(planTier, feature, lapsedSelfHost);
      assert.equal(write.allowed, true, feature);
    }

    for (const feature of ENTERPRISE_MODULE_FEATURES) {
      assert.equal(planFeatureAccess(planTier, feature, lapsedSelfHost), "lapsed", feature);
      assert.equal(planFeatureReadable(planTier, feature, lapsedSelfHost), true, feature);
      assert.equal(hasPlanFeature(planTier, feature, lapsedSelfHost), false, feature);
      const write = planFeatureWriteDecision(planTier, feature, lapsedSelfHost);
      assert.equal(write.allowed, false, feature);
      if (!write.allowed) {
        assert.equal(write.code, PLAN_LICENSE_LAPSED, feature);
        assert.equal(write.status, 402, feature);
      }
    }

    const storage = planFeatureWriteDecision(planTier, "storageQuotas", lapsedSelfHost);
    assert.equal(storage.allowed, false, String(planTier));
    if (!storage.allowed) {
      assert.equal(storage.code, "PLAN_FEATURE_REQUIRED");
      assert.equal(storage.status, 403);
    }
  }
});

test("lapsed self-host caps new members and shared vaults by the FREE quota, not 402", () => {
  for (const planTier of STORED_TIERS) {
    const limits = getPlanQuotaLimits(planTier, lapsedSelfHost);
    assert.equal(limits.maxAdditionalMembers, 10, String(planTier));
    assert.equal(limits.maxSharedVaults, 1, String(planTier));
    assert.equal(limits.storageQuota.baseMb, null, String(planTier));

    const members = planFeatureWriteDecision(planTier, "additionalWorkspaceMembers", lapsedSelfHost);
    const vaults = planFeatureWriteDecision(planTier, "sharedVaults", lapsedSelfHost);
    assert.equal(members.allowed, true);
    assert.equal(vaults.allowed, true);

    // Same comparisons as assertSharedVaultQuota (`used >= max`) and
    // assertAdditionalMembersQuota (`used + incoming > max`).
    const maxVaults = limits.maxSharedVaults ?? Number.POSITIVE_INFINITY;
    const maxMembers = limits.maxAdditionalMembers ?? Number.POSITIVE_INFINITY;
    assert.equal(1 >= maxVaults, true);
    assert.equal(0 >= maxVaults, false);
    assert.equal(10 + 1 > maxMembers, true);
    assert.equal(10 + 0 > maxMembers, false);
  }
});

test("shared-vault ITEM_CREATE follows granted sharedVaults and cannot return PLAN_LICENSE_LAPSED", () => {
  assert.equal(hasPlanFeature("ENTERPRISE", "sharedVaults", lapsedSelfHost), true);
  assert.equal(planFeatureReadable("ENTERPRISE", "sharedVaults", lapsedSelfHost), true);
  const write = planFeatureWriteDecision("ENTERPRISE", "sharedVaults", lapsedSelfHost);
  assert.equal(write.allowed, true);

  const workspace = {
    id: "w1",
    name: "Workspace",
    ownerId: "u1",
    planTier: "ENTERPRISE",
    planCustomOverride: false,
    planFeatureOverrides: {},
    createdAt: "",
    updatedAt: "",
  };
  const sharedVault = {
    id: "v-shared",
    workspaceId: "w1",
    name: "Shared",
    description: "",
    icon: "",
    isPersonal: false,
    ownerId: "u1",
    cryptoVersion: 2,
    createdAt: "",
    updatedAt: "",
  };

  const allowed = evaluateSharedVaultItemCreateGate({
    vault: sharedVault,
    workspace,
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
  });
  assert.equal(allowed.ok, true);

  const denied = evaluateSharedVaultItemCreateGate({
    vault: sharedVault,
    workspace: {
      ...workspace,
      planTier: "ENTERPRISE",
      planCustomOverride: true,
      planFeatureOverrides: { sharedVaults: false },
    },
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.code, "PLAN_FEATURE_REQUIRED");
    assert.equal(denied.statusCode, 403);
    assert.notEqual(denied.code, PLAN_LICENSE_LAPSED);
  }
});

test("SaaS ignores enterpriseLicenseLapsed and keeps using plan_tier", () => {
  const flagged = {
    deploymentMode: "saas" as const,
    enterpriseModulesActive: true,
    enterpriseLicenseLapsed: true,
  };
  assert.equal(isSelfHostedEnterpriseLicenseLapsed(flagged), false);
  assert.equal(resolveEntitlementPlanTier("ENTERPRISE", flagged), "ENTERPRISE");
  assert.equal(resolveEntitlementPlanTier("TEAM", flagged), "TEAM");
  assert.equal(resolveEntitlementPlanTier("PREMIUM", flagged), "PREMIUM");
  assert.equal(resolveEntitlementPlanTier("FREE", flagged), "FREE");

  const enterpriseRoles = planFeatureWriteDecision("ENTERPRISE", "customWorkspaceRoles", flagged);
  assert.equal(enterpriseRoles.allowed, true);
  assert.equal(planFeatureWriteDecision("TEAM", "capsuleAccessSettings", flagged).allowed, true);
  assert.equal(hasPlanFeature("PREMIUM", "filesInItems", flagged), true);
  assert.equal(hasPlanFeature("PREMIUM", "capsuleAccessSettings", flagged), false);
  assert.equal(getPlanQuotaLimits("ENTERPRISE", flagged).maxAdditionalMembers, null);
  assert.equal(getPlanQuotaLimits("ENTERPRISE", flagged).maxSharedVaults, null);

  const freeRoles = planFeatureWriteDecision("FREE", "customWorkspaceRoles", flagged);
  assert.equal(freeRoles.allowed, false);
  if (!freeRoles.allowed) {
    assert.equal(freeRoles.code, "PLAN_FEATURE_REQUIRED");
    assert.equal(freeRoles.status, 403);
    assert.notEqual(freeRoles.code, PLAN_LICENSE_LAPSED);
  }
  assert.equal(planFeatureAccess("FREE", "monitoring", flagged), "unavailable");
  assert.equal(planFeatureWriteDecision("FREE", "sharedVaults", flagged).allowed, true);
  assert.equal(planFeatureWriteDecision("FREE", "additionalWorkspaceMembers", flagged).allowed, true);
  assert.equal(hasPlanFeature("FREE", "filesInItems", flagged), false);
  assert.equal(getPlanQuotaLimits("FREE", flagged).maxAdditionalMembers, 3);
  assert.equal(getPlanQuotaLimits("FREE", flagged).maxSharedVaults, 1);
  assert.equal(getPlanQuotaLimits("FREE", flagged).storageQuota.baseMb, 100);
});

test("API runtime helpers do not carry enterpriseLicenseLapsed", () => {
  const config = { deploymentMode: "self_hosted" as const, enterpriseModulesEnabled: true };
  const options = workspacePlanEntitlementOptions(config, { planTier: "FREE" });
  assert.equal(options.enterpriseLicenseLapsed, undefined);

  const roles = workspacePlanFeatureWriteDecision(config, { planTier: "FREE" }, "customWorkspaceRoles");
  assert.equal(roles.allowed, true);
  const invites = workspacePlanFeatureWriteDecision(
    config,
    { planTier: "ENTERPRISE" },
    "additionalWorkspaceMembers",
  );
  assert.equal(invites.allowed, true);
  const vaults = workspacePlanFeatureWriteDecision(config, { planTier: "ENTERPRISE" }, "sharedVaults");
  assert.equal(vaults.allowed, true);

  const runtimeQuotas = workspaceGetPlanQuotaLimits(config, { planTier: "ENTERPRISE" });
  assert.equal(runtimeQuotas.maxAdditionalMembers, null);
  assert.equal(runtimeQuotas.maxSharedVaults, null);

  const injected = getPlanQuotaLimits("ENTERPRISE", lapsedSelfHost);
  assert.equal(injected.maxAdditionalMembers, 10);
  assert.equal(injected.maxSharedVaults, 1);
});
