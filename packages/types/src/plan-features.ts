/** Workspace commercial plan tiers (Core). Extend later with PREMIUM | FAMILY | TEAM. */
export type PlanTier = "FREE" | "ENTERPRISE";

/** Feature flags gated by {@link PlanTier}. Add rows to {@link PLAN_FEATURE_MATRIX} when splitting plans. */
export type PlanFeature =
  | "capsules"
  | "capsuleAccessSettings"
  | "customWorkspaceRoles"
  | "customWorkspaceProfiles"
  | "paidPlanBadge";

export const PLAN_TIERS: readonly PlanTier[] = ["FREE", "ENTERPRISE"] as const;

export const PLAN_FEATURES: readonly PlanFeature[] = [
  "capsules",
  "capsuleAccessSettings",
  "customWorkspaceRoles",
  "customWorkspaceProfiles",
  "paidPlanBadge",
] as const;

/**
 * Source of truth for plan entitlements.
 * Splitting ENTERPRISE later = new PlanTier rows + matrix cells; call sites stay on {@link hasPlanFeature}.
 */
export const PLAN_FEATURE_MATRIX: Record<PlanTier, Record<PlanFeature, boolean>> = {
  FREE: {
    capsules: true,
    capsuleAccessSettings: false,
    customWorkspaceRoles: false,
    customWorkspaceProfiles: false,
    paidPlanBadge: false,
  },
  ENTERPRISE: {
    capsules: true,
    capsuleAccessSettings: true,
    customWorkspaceRoles: true,
    customWorkspaceProfiles: true,
    paidPlanBadge: true,
  },
};

/** Fail-closed: unknown / legacy tiers behave as FREE. Only explicit ENTERPRISE unlocks paid features. */
export function normalizePlanTier(planTier: string | null | undefined): PlanTier {
  if (planTier === "ENTERPRISE") {
    return "ENTERPRISE";
  }
  return "FREE";
}

export function isPlanTier(value: string): value is PlanTier {
  return value === "FREE" || value === "ENTERPRISE";
}

export function hasPlanFeature(
  planTier: string | null | undefined,
  feature: PlanFeature,
): boolean {
  return PLAN_FEATURE_MATRIX[normalizePlanTier(planTier)][feature];
}
