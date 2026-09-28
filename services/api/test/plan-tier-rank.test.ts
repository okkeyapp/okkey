import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_TIER_RANK,
  canRequestPlanUpgrade,
  comparePlanTiers,
  planCatalogGroupForTier,
  planTiersForCatalogGroup,
} from "../../../packages/types/src/plan-features.ts";

test("PLAN_TIER_RANK orders personal then business", () => {
  assert.ok(PLAN_TIER_RANK.FREE < PLAN_TIER_RANK.PREMIUM);
  assert.ok(PLAN_TIER_RANK.PREMIUM < PLAN_TIER_RANK.FAMILY);
  assert.ok(PLAN_TIER_RANK.FAMILY < PLAN_TIER_RANK.TEAM);
  assert.ok(PLAN_TIER_RANK.TEAM < PLAN_TIER_RANK.ENTERPRISE);
});

test("canRequestPlanUpgrade only allows higher tiers", () => {
  assert.equal(canRequestPlanUpgrade("FREE", "PREMIUM"), true);
  assert.equal(canRequestPlanUpgrade("PREMIUM", "FAMILY"), true);
  assert.equal(canRequestPlanUpgrade("PREMIUM", "TEAM"), true);
  assert.equal(canRequestPlanUpgrade("FAMILY", "PREMIUM"), false);
  assert.equal(canRequestPlanUpgrade("ENTERPRISE", "TEAM"), false);
  assert.equal(canRequestPlanUpgrade("FREE", "FREE"), false);
});

test("catalog groups keep FREE on personal only", () => {
  assert.deepEqual([...planTiersForCatalogGroup("personal")], ["FREE", "PREMIUM", "FAMILY"]);
  assert.deepEqual([...planTiersForCatalogGroup("business")], ["TEAM", "ENTERPRISE"]);
  assert.equal(planCatalogGroupForTier("TEAM"), "business");
  assert.equal(planCatalogGroupForTier("PREMIUM"), "personal");
  assert.ok(comparePlanTiers("ENTERPRISE", "FREE") > 0);
});
