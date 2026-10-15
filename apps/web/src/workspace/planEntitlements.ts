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
 * Backend modules flag from GET /public/features.
 * `null` = not probed yet (fall back to Vite-only).
 * `false` = API has modules off → hide EE Create/License UI even if Vite ACTIVE.
 */
let backendEnterpriseModulesActive: boolean | null = null;

/** Apply API probe result so web entitlements cannot exceed backend modules. */
export function setBackendEnterpriseModulesActive(active: boolean): void {
  backendEnterpriseModulesActive = active;
}

/** Test helper — reset probe cache between vitest cases. */
export function resetBackendEnterpriseModulesActiveForTests(): void {
  backendEnterpriseModulesActive = null;
}

function viteEnterpriseModulesActive(): boolean {
  const active = import.meta.env.VITE_ENTERPRISE_MODULES_ACTIVE;
  if (active === "true" || active === "false") {
    return active === "true";
  }
  return import.meta.env.VITE_ENTERPRISE_MODULES === "true";
}

/**
 * Effective modules flag after Vite fail-closed resolve, AND-gated by API probe when known.
 * Prefer `VITE_ENTERPRISE_MODULES_ACTIVE` (set by vite.config); fall back to bootstrap env.
 */
export function webEnterpriseModulesActive(): boolean {
  const viteActive = viteEnterpriseModulesActive();
  if (!viteActive) {
    return false;
  }
  if (backendEnterpriseModulesActive === false) {
    return false;
  }
  return true;
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
