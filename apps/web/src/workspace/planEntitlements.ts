import {
  hasPlanFeature,
  normalizePlanTier,
  planEntitlementOptionsFromWorkspace,
  planFeatureAccess,
  resolveEntitlementPlanTier,
  type DeploymentMode,
  type PlanEntitlementOptions,
  type PlanFeature,
  type PlanFeatureAccess,
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
 * Catalog tier for plan labels and the settings plan page on this client.
 * Self-hosted with modules → ENTERPRISE. Self-hosted without modules → FREE.
 * Stored `plan_tier` is ignored on self-host. SaaS → workspace `plan_tier`.
 * Feature writes follow the same resolution via {@link webPlanFeatureAccess}.
 */
export function webDisplayPlanTier(workspace?: WorkspaceLike | null): PlanTier {
  if (webDeploymentMode() === "self_hosted") {
    return resolveEntitlementPlanTier(workspace?.planTier, webPlanEntitlementOptions(workspace));
  }
  return normalizePlanTier(workspace?.planTier);
}

/**
 * Web feature gate for create and update.
 * Self-hosted modules on → ENTERPRISE for every stored `plan_tier`.
 * Self-hosted modules off → FREE for every stored `plan_tier`.
 * SaaS → `plan_tier`.
 */
export function workspaceHasPlanFeature(
  workspace: WorkspaceLike | null | undefined,
  feature: PlanFeature,
): boolean {
  return hasPlanFeature(workspace?.planTier, feature, webPlanEntitlementOptions(workspace));
}

/** Granted, lapsed, or unavailable for this client. */
export function webPlanFeatureAccess(
  workspace: WorkspaceLike | null | undefined,
  feature: PlanFeature,
): PlanFeatureAccess {
  return planFeatureAccess(workspace?.planTier, feature, webPlanEntitlementOptions(workspace));
}

/**
 * Enterprise-module screens stay visible after a license lapses.
 * `true` hides create and edit. List and delete stay available.
 */
export function webEnterpriseModuleReadOnly(
  workspace: WorkspaceLike | null | undefined,
  feature: PlanFeature,
): boolean {
  return webPlanFeatureAccess(workspace, feature) !== "granted";
}
