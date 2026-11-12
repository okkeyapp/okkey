import {
  getPlanQuotaLimits,
  hasPlanFeature,
  planEntitlementOptionsFromWorkspace,
  planFeatureWriteDecision,
  type PlanEntitlementOptions,
  type PlanFeature,
  type PlanFeatureOverrides,
  type PlanFeatureWriteDecision,
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

/** Runtime entitlement context from API config (deployment mode and whether modules loaded). */
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

/** Runtime options for one workspace, including deployment mode and loaded modules. */
export function workspacePlanFeatureWriteDecision(
  config: PlanEntitlementRuntimeConfig,
  workspace: WorkspacePlanEntitlementSource,
  feature: PlanFeature,
): PlanFeatureWriteDecision {
  return planFeatureWriteDecision(
    workspace.planTier,
    feature,
    workspacePlanEntitlementOptions(config, workspace),
  );
}

/**
 * Feature gate for create and update.
 * Self-hosted modules on and a paid plan → ENTERPRISE.
 * Self-hosted modules on and FREE → FREE, with enterprise modules lapsed.
 * Modules off → FREE. SaaS → `plan_tier`.
 */
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
