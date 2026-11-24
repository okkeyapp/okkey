import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isPlanTier, normalizePlanTier, readPlanTier } from "../../../packages/types/src/plan-features.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(__dirname, "../migrations/0047_retire_family_plan_tier.sql");

test("FAMILY retirement migration rewrites FAMILY rows to PREMIUM and leaves custom overrides", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const update = sql.match(/UPDATE\s+workspaces[\s\S]*?;/i)?.[0] ?? "";
  assert.ok(update.length > 0);

  assert.match(update, /plan_tier\s*=\s*'PREMIUM'/);
  assert.match(update, /WHERE\s+plan_tier\s*=\s*'FAMILY'/);
  assert.doesNotMatch(update, /plan_custom_override/);
  assert.doesNotMatch(update, /plan_feature_overrides/);
  assert.doesNotMatch(sql, /CREATE\s+TYPE|ADD\s+CONSTRAINT|DROP\s+CONSTRAINT|CHECK\s*\(/i);
});

test("reading a legacy FAMILY tier maps to PREMIUM and is not a catalog tier", () => {
  assert.equal(normalizePlanTier("FAMILY"), "PREMIUM");
  assert.equal(readPlanTier("FAMILY"), "PREMIUM");
  assert.equal(readPlanTier("TEAM"), "TEAM");
  assert.equal(readPlanTier("GOLD"), null);
  assert.equal(isPlanTier("FAMILY"), false);
  assert.equal(isPlanTier("PREMIUM"), true);
});
