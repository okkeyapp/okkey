import {
  hasPlanFeature,
  planEntitlementOptionsFromWorkspace,
  resolveEntitlementPlanTier,
  type DeploymentMode,
  type PlanEntitlementOptions,
  type PlanFeature,
  type PlanFeatureOverrides,
  type PlanTier,
} from "@okkey/types";

type WorkspaceLike = {
  planTier?: string | null;
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
};

/**
 * Effective modules flag after Vite fail-closed resolve.
 * Prefer `VITE_ENTERPRISE_MODULES_ACTIVE` (set by vite.config); fall back to bootstrap env.
 */
export function webEnterpriseModulesActive(): boolean {
  const active = import.meta.env.VITE_ENTERPRISE_MODULES_ACTIVE;
  if (active === "true" || active === "false") {
    return active === "true";
  }
  return import.meta.env.VITE_ENTERPRISE_MODULES === "true";
}

export function webDeploymentMode(): DeploymentMode {
  return import.meta.env.VITE_DEPLOYMENT_MODE === "saas" ? "saas" : "self_hosted";
}

export function webPlanEntitlementOptions(workspace?: WorkspaceLike | null): PlanEntitlementOptions {
  return {
    ...planEntitlementOptionsFromWorkspace(workspace ?? {}),
    deploymentMode: webDeploymentMode(),
    enterpriseModulesActive: webEnterpriseModulesActive(),
  };
}

/**
 * Catalog tier for plan labels /settings/plan on this client.
 * Self-hosted: modules only (ignore DB `plan_tier`). SaaS: workspace `plan_tier`.
 */
export function webDisplayPlanTier(workspace?: WorkspaceLike | null): PlanTier {
  return resolveEntitlementPlanTier(workspace?.planTier, webPlanEntitlementOptions(workspace));
}

/** Web feature gate: self-host → modules; SaaS → `plan_tier`. */
export function workspaceHasPlanFeature(
  workspace: WorkspaceLike | null | undefined,
  feature: PlanFeature,
): boolean {
  return hasPlanFeature(workspace?.planTier, feature, webPlanEntitlementOptions(workspace));
}
