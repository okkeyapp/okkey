import type { PlanEntitlementRuntimeConfig } from "../src/plan-entitlements.ts";

/** SaaS entitlements so stored plan_tier is the effective catalog tier. */
export function entitlementConfig(
  overrides: Partial<PlanEntitlementRuntimeConfig> = {},
): PlanEntitlementRuntimeConfig {
  return {
    deploymentMode: "saas",
    enterpriseModulesEnabled: false,
    ...overrides,
  };
}
