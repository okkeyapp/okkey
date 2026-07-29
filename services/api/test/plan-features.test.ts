import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_FEATURE_MATRIX,
  PLAN_FEATURES,
  PLAN_TIERS,
  hasPlanFeature,
  isPlanTier,
  normalizePlanTier,
} from "../../../packages/types/src/plan-features.ts";

test("PLAN_FEATURE_MATRIX covers every tier and feature", () => {
  for (const tier of PLAN_TIERS) {
    for (const feature of PLAN_FEATURES) {
      assert.equal(typeof PLAN_FEATURE_MATRIX[tier][feature], "boolean");
    }
  }
});

test("hasPlanFeature: FREE baseline", () => {
  assert.equal(hasPlanFeature("FREE", "capsules"), true);
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings"), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceRoles"), false);
  assert.equal(hasPlanFeature("FREE", "customWorkspaceProfiles"), false);
  assert.equal(hasPlanFeature("FREE", "paidPlanBadge"), false);
});

test("hasPlanFeature: ENTERPRISE unlocks paid features", () => {
  assert.equal(hasPlanFeature("ENTERPRISE", "capsules"), true);
  assert.equal(hasPlanFeature("ENTERPRISE", "capsuleAccessSettings"), true);
  assert.equal(hasPlanFeature("ENTERPRISE", "customWorkspaceRoles"), true);
  assert.equal(hasPlanFeature("ENTERPRISE", "customWorkspaceProfiles"), true);
  assert.equal(hasPlanFeature("ENTERPRISE", "paidPlanBadge"), true);
});

test("normalizePlanTier fail-closed for unknown and legacy tiers", () => {
  assert.equal(normalizePlanTier("ENTERPRISE"), "ENTERPRISE");
  assert.equal(normalizePlanTier("FREE"), "FREE");
  assert.equal(normalizePlanTier("TEAM"), "FREE");
  assert.equal(normalizePlanTier("PREMIUM"), "FREE");
  assert.equal(normalizePlanTier(undefined), "FREE");
  assert.equal(normalizePlanTier(null), "FREE");
  assert.equal(hasPlanFeature("TEAM", "customWorkspaceRoles"), false);
});

test("isPlanTier", () => {
  assert.equal(isPlanTier("FREE"), true);
  assert.equal(isPlanTier("ENTERPRISE"), true);
  assert.equal(isPlanTier("TEAM"), false);
});
