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
   * Plugin-confirmed verified license. Default unset/false → modules inactive
   * (fail-closed). Required for self-host ENTERPRISE entitlements.
   */
  enterpriseLicenseVerified?: boolean;
  /**
   * Self-hosted license lapse reported by the plugin (soft-lock).
   * Independent of {@link enterpriseLicenseVerified}: expired licenses may clear
   * verification while keeping this set so enterprise-module writes return 402.
   * Default unset/false → not lapsed. `plan_tier` is not a lapse.
   */
  enterpriseLicenseLapsed?: boolean;
};

export type WorkspacePlanEntitlementSource = {
  planTier?: string | null;
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

/**
 * True only when the sibling plugin is loaded **and** has confirmed a verified
 * license. `ENTERPRISE_MODULES` / `enterpriseModulesEnabled` alone never suffice.
 */
export function isEnterpriseModulesEntitlementActive(
  config: Pick<PlanEntitlementRuntimeConfig, "enterpriseModulesEnabled" | "enterpriseLicenseVerified">,
): boolean {
  return config.enterpriseModulesEnabled === true && config.enterpriseLicenseVerified === true;
}

/** Runtime entitlement context from API config (deployment mode and license-gated modules). */
export function planEntitlementRuntimeFromConfig(
  config: PlanEntitlementRuntimeConfig,
): Pick<
  PlanEntitlementOptions,
  "deploymentMode" | "enterpriseModulesActive" | "enterpriseLicenseLapsed"
> {
  return {
    deploymentMode: config.deploymentMode,
    enterpriseModulesActive: isEnterpriseModulesEntitlementActive(config),
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
 * Self-hosted modules on (plugin loaded + license verified) → ENTERPRISE for every stored `plan_tier`.
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
