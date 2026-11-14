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
> & {
  /**
   * Self-hosted license lapse. Production config leaves this unset (no license
   * check is wired). Tests and a future check set it; `plan_tier` is not a lapse.
   */
  enterpriseLicenseLapsed?: boolean;
};

export type WorkspacePlanEntitlementSource = {
  planTier?: string | null;
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

/** Runtime entitlement context from API config (deployment mode and whether modules loaded). */
export function planEntitlementRuntimeFromConfig(
  config: PlanEntitlementRuntimeConfig,
): Pick<
  PlanEntitlementOptions,
  "deploymentMode" | "enterpriseModulesActive" | "enterpriseLicenseLapsed"
> {
  return {
    deploymentMode: config.deploymentMode,
    enterpriseModulesActive: config.enterpriseModulesEnabled,
    ...(config.enterpriseLicenseLapsed === true ? { enterpriseLicenseLapsed: true } : {}),
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
 * Self-hosted modules on → ENTERPRISE for every stored `plan_tier`.
 * Self-hosted modules off → FREE for every stored `plan_tier`.
 * SaaS → `plan_tier`. A lapsed license is a separate signal and is not read from `plan_tier`.
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
