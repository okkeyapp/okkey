import {
  getPlanQuotaLimits,
  hasPlanFeature,
  planEntitlementOptionsFromWorkspace,
  type PlanEntitlementOptions,
  type PlanFeature,
  type PlanFeatureOverrides,
  type PlanQuotaLimits,
} from "@okkey/types";

import type { ApiConfig } from "./config.ts";

export type PlanEntitlementRuntimeConfig = Pick<
  ApiConfig,
  "deploymentMode" | "enterpriseModulesEnabled"
>;

export type WorkspacePlanEntitlementSource = {
  planTier?: string | null;
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

/** Runtime entitlement context from API config (self-host: modules → ENTERPRISE / FREE; SaaS: plan_tier). */
export function planEntitlementRuntimeFromConfig(
  config: PlanEntitlementRuntimeConfig,
): Pick<PlanEntitlementOptions, "deploymentMode" | "enterpriseModulesActive"> {
  return {
    deploymentMode: config.deploymentMode,
    enterpriseModulesActive: config.enterpriseModulesEnabled,
  };
}

export function workspacePlanEntitlementOptions(
  config: PlanEntitlementRuntimeConfig,
  workspace: WorkspacePlanEntitlementSource,
): PlanEntitlementOptions {
  return {
    ...planEntitlementOptionsFromWorkspace(workspace),
    ...planEntitlementRuntimeFromConfig(config),
  };
}

/** Feature gate: self-host modules on → ENTERPRISE; modules off → FREE; SaaS → `plan_tier`. */
export function workspaceHasPlanFeature(
  config: PlanEntitlementRuntimeConfig,
  workspace: WorkspacePlanEntitlementSource,
  feature: PlanFeature,
): boolean {
  return hasPlanFeature(
    workspace.planTier,
    feature,
    workspacePlanEntitlementOptions(config, workspace),
  );
}

/** Soft numeric quotas for the effective entitlement tier. */
export function workspaceGetPlanQuotaLimits(
  config: PlanEntitlementRuntimeConfig,
  workspace: WorkspacePlanEntitlementSource,
): PlanQuotaLimits {
  return getPlanQuotaLimits(
    workspace.planTier,
    planEntitlementRuntimeFromConfig(config),
  );
}
