/**
 * Workspace commercial plan tiers (Core).
 * Product groups: personal (FREE / PREMIUM / FAMILY) and business (TEAM / ENTERPRISE).
 * Selective “by request” plans use {@link PlanCustomOverride} — not a separate tier value.
 */
export type PlanTier = "FREE" | "PREMIUM" | "FAMILY" | "TEAM" | "ENTERPRISE";

/**
 * Feature flags gated by {@link PlanTier}.
 * Call sites must use {@link hasPlanFeature} (optionally with custom overrides).
 */
export type PlanFeature =
  | "capsules"
  | "capsuleAccessSettings"
  | "customWorkspaceRoles"
  | "customWorkspaceProfiles"
  | "sharedVaults"
  | "additionalWorkspaceMembers"
  | "paidPlanBadge"
  | "accountRecovery"
  | "trustedContacts"
  | "filesInItems"
  | "monitoring"
  | "storageQuotas";

/** Per-feature overrides when {@link PlanCustomOverride.enabled} is true. */
export type PlanFeatureOverrides = Partial<Record<PlanFeature, boolean>>;

/**
 * Custom / “by request” plan: keep a catalog {@link PlanTier} for billing display,
 * and selectively enable or disable features via overrides.
 */
export type PlanCustomOverride = {
  enabled: boolean;
  featureOverrides: PlanFeatureOverrides;
};

/** Soft numeric limits associated with a catalog tier (null = unlimited). */
export type PlanQuotaLimits = {
  /** Max members beyond the owner (additional seats). */
  maxAdditionalMembers: number | null;
  /** Max shared vaults (personal vault always allowed when plan permits). */
  maxSharedVaults: number | null;
  /** Soft attachment / file storage budget in MiB (enforcement later). */
  maxAttachmentStorageMb: number | null;
};

export type PlanEntitlementOptions = {
  customOverride?: boolean | null;
  featureOverrides?: PlanFeatureOverrides | null;
};

export const PLAN_TIERS: readonly PlanTier[] = [
  "FREE",
  "PREMIUM",
  "FAMILY",
  "TEAM",
  "ENTERPRISE",
] as const;

export const PLAN_FEATURES: readonly PlanFeature[] = [
  "capsules",
  "capsuleAccessSettings",
  "customWorkspaceRoles",
  "customWorkspaceProfiles",
  "sharedVaults",
  "additionalWorkspaceMembers",
  "paidPlanBadge",
  "accountRecovery",
  "trustedContacts",
  "filesInItems",
  "monitoring",
  "storageQuotas",
] as const;

const ALL_PAID_FALSE = {
  capsules: true,
  capsuleAccessSettings: false,
  customWorkspaceRoles: false,
  customWorkspaceProfiles: false,
  sharedVaults: false,
  additionalWorkspaceMembers: false,
  paidPlanBadge: false,
  accountRecovery: false,
  trustedContacts: false,
  filesInItems: false,
  monitoring: false,
  storageQuotas: false,
} as const satisfies Record<PlanFeature, boolean>;

const PERSONAL_PAID = {
  ...ALL_PAID_FALSE,
  capsuleAccessSettings: true,
  paidPlanBadge: true,
  accountRecovery: true,
  trustedContacts: true,
  filesInItems: true,
  monitoring: true,
  storageQuotas: true,
} as const satisfies Record<PlanFeature, boolean>;

const FAMILY_PAID = {
  ...PERSONAL_PAID,
  sharedVaults: true,
  additionalWorkspaceMembers: true,
  customWorkspaceRoles: true,
  customWorkspaceProfiles: true,
} as const satisfies Record<PlanFeature, boolean>;

const BUSINESS_PAID = {
  ...FAMILY_PAID,
} as const satisfies Record<PlanFeature, boolean>;

/**
 * Source of truth for plan entitlements.
 * New catalog tiers or features = matrix cells only; call sites stay on {@link hasPlanFeature}.
 *
 * Mapping notes (APP.md + Figma SaaS cards):
 * - FREE: capsules without access settings; no files / monitoring / recovery / shared vaults / seats.
 * - PREMIUM: personal paid (files, monitoring, recovery, capsule access settings).
 * - FAMILY: PREMIUM + seats / shared vaults / custom roles & profiles (multi-user personal).
 * - TEAM / ENTERPRISE: full business matrix (same feature set today; ENTERPRISE reserved for future extras).
 */
export const PLAN_FEATURE_MATRIX: Record<PlanTier, Record<PlanFeature, boolean>> = {
  FREE: { ...ALL_PAID_FALSE },
  PREMIUM: { ...PERSONAL_PAID },
  FAMILY: { ...FAMILY_PAID },
  TEAM: { ...BUSINESS_PAID },
  ENTERPRISE: { ...BUSINESS_PAID },
};

/**
 * Soft quota defaults per catalog tier.
 * Exact commercial numbers are product-tunable; FREE keeps zeros (no paid storage / seats / shared vaults).
 */
export const PLAN_QUOTA_LIMITS: Record<PlanTier, PlanQuotaLimits> = {
  FREE: {
    maxAdditionalMembers: 0,
    maxSharedVaults: 0,
    maxAttachmentStorageMb: 0,
  },
  PREMIUM: {
    maxAdditionalMembers: 0,
    maxSharedVaults: 0,
    maxAttachmentStorageMb: 5 * 1024,
  },
  FAMILY: {
    maxAdditionalMembers: 5,
    maxSharedVaults: 5,
    maxAttachmentStorageMb: 20 * 1024,
  },
  TEAM: {
    maxAdditionalMembers: 25,
    maxSharedVaults: 50,
    maxAttachmentStorageMb: 100 * 1024,
  },
  ENTERPRISE: {
    maxAdditionalMembers: null,
    maxSharedVaults: null,
    maxAttachmentStorageMb: null,
  },
};

const PLAN_TIER_SET: ReadonlySet<string> = new Set(PLAN_TIERS);

/**
 * Fail-closed: unknown / legacy strings behave as FREE.
 * Known product tiers (including PREMIUM / FAMILY / TEAM) normalize to themselves.
 * Existing ENTERPRISE rows stay ENTERPRISE (no remapping).
 */
export function normalizePlanTier(planTier: string | null | undefined): PlanTier {
  if (planTier && PLAN_TIER_SET.has(planTier)) {
    return planTier as PlanTier;
  }
  return "FREE";
}

export function isPlanTier(value: string): value is PlanTier {
  return PLAN_TIER_SET.has(value);
}

export function emptyPlanFeatureOverrides(): PlanFeatureOverrides {
  return {};
}

export function sanitizePlanFeatureOverrides(
  value: unknown,
): PlanFeatureOverrides {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const result: PlanFeatureOverrides = {};
  for (const feature of PLAN_FEATURES) {
    if (typeof raw[feature] === "boolean") {
      result[feature] = raw[feature];
    }
  }
  return result;
}

/**
 * Resolve whether a plan grants a feature.
 * When custom override is enabled, explicit featureOverrides win over the catalog matrix.
 */
export function hasPlanFeature(
  planTier: string | null | undefined,
  feature: PlanFeature,
  options?: PlanEntitlementOptions,
): boolean {
  const base = PLAN_FEATURE_MATRIX[normalizePlanTier(planTier)][feature];
  if (!options?.customOverride) {
    return base;
  }
  const overridden = options.featureOverrides?.[feature];
  if (typeof overridden === "boolean") {
    return overridden;
  }
  return base;
}

export function getPlanQuotaLimits(
  planTier: string | null | undefined,
): PlanQuotaLimits {
  return PLAN_QUOTA_LIMITS[normalizePlanTier(planTier)];
}

/** All feature flags for a tier (after optional custom overrides). */
export function resolvePlanFeatures(
  planTier: string | null | undefined,
  options?: PlanEntitlementOptions,
): Record<PlanFeature, boolean> {
  const out = {} as Record<PlanFeature, boolean>;
  for (const feature of PLAN_FEATURES) {
    out[feature] = hasPlanFeature(planTier, feature, options);
  }
  return out;
}

/** Build entitlement options from a workspace-shaped record. */
export function planEntitlementOptionsFromWorkspace(workspace: {
  planCustomOverride?: boolean | null;
  planFeatureOverrides?: PlanFeatureOverrides | null;
}): PlanEntitlementOptions {
  return {
    customOverride: Boolean(workspace.planCustomOverride),
    featureOverrides: workspace.planFeatureOverrides ?? {},
  };
}
