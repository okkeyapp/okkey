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

/**
 * Backend license-management flag from GET /public/features.
 * True when the sibling enterprise plugin is loaded (license UI available).
 * Independent of {@link backendEnterpriseModulesActive}; does not unlock modules.
 * `null` = not probed yet.
 */
let backendEnterpriseLicenseManagementAvailable: boolean | null = null;

/**
 * Effective deployment mode from GET /public/features.
 * `null` = not probed yet. Hosted is never taken from Vite alone.
 */
let backendDeploymentMode: DeploymentMode | null = null;

/** Apply API probe result so web entitlements cannot exceed backend modules. */
export function setBackendEnterpriseModulesActive(active: boolean): void {
  backendEnterpriseModulesActive = active;
}

/**
 * Apply API probe: sibling plugin loaded → license management UI may be shown.
 * Does not enable gated features.
 */
export function setBackendEnterpriseLicenseManagementAvailable(available: boolean): void {
  backendEnterpriseLicenseManagementAvailable = available;
}

/** Apply API effective deployment mode (hosted only after plugin confirmation). */
export function setBackendDeploymentMode(mode: DeploymentMode): void {
  backendDeploymentMode = mode === "saas" ? "saas" : "self_hosted";
}

/** Test helper — reset probe cache between vitest cases. */
export function resetBackendEnterpriseModulesActiveForTests(): void {
  backendEnterpriseModulesActive = null;
  backendEnterpriseLicenseManagementAvailable = null;
  backendDeploymentMode = null;
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

/**
 * Whether self-hosted license management UI is available (plugin installed).
 * Requires an explicit API `true` from `/public/features`. Does not unlock modules.
 * A Vite sibling alias alone is not enough — wait for the probe.
 */
export function webEnterpriseLicenseManagementAvailable(): boolean {
  return backendEnterpriseLicenseManagementAvailable === true;
}

/**
 * Effective deployment mode for entitlements and UI.
 * Hosted (`saas`) only when the API reported confirmed hosted mode.
 * A Vite env value alone never makes the client hosted.
 */
export function webDeploymentMode(): DeploymentMode {
  if (backendDeploymentMode === "saas") {
    return "saas";
  }
  return "self_hosted";
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
 * Stored `plan_tier` is ignored on self-host. Confirmed hosted → workspace `plan_tier`.
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
 * Confirmed hosted → `plan_tier`.
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

/**
 * Whether to mount enterprise UI surfaces (device recovery approval, trusted
 * contacts invite/share-release, capsule approval).
 * Confirmed hosted → billing `plan_tier` for the feature.
 * Self-hosted → `enterpriseModulesActive` (license-gated modules).
 */
export function webEnterpriseSurfaceEnabled(
  workspace: WorkspaceLike | null | undefined,
  feature: PlanFeature,
): boolean {
  if (webDeploymentMode() === "saas") {
    return workspaceHasPlanFeature(workspace, feature);
  }
  return webEnterpriseModulesActive();
}
