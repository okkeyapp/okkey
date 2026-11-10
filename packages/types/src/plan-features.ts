/**
 * Workspace commercial plan tiers (Core).
 * Product groups: personal (FREE / PREMIUM) and business (TEAM / ENTERPRISE).
 * Selective “by request” plans use {@link PlanCustomOverride} — not a separate tier value.
 */
export type PlanTier = "FREE" | "PREMIUM" | "TEAM" | "ENTERPRISE";

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
  | "filesInCapsules"
  | "monitoring"
  | "storageQuotas";

/** Per-feature overrides when {@link PlanCustomOverride.enabled} is true. */
export type PlanFeatureOverrides = Partial<Record<PlanFeature, boolean>>;

/**
 * Custom / “by request” plan: keep a catalog {@link PlanTier} for billing display,
 * and selectively enable or disable features via overrides.
 * Overrides do not change {@link PlanQuotaLimits}.
 */
export type PlanCustomOverride = {
  enabled: boolean;
  featureOverrides: PlanFeatureOverrides;
};

/**
 * Encrypted workspace storage ceiling.
 * `baseMb === null` means no ceiling (self-hosted).
 * Otherwise the limit is `baseMb + perMemberMb * active members` (owner included).
 */
export type WorkspaceStorageQuota = {
  /** MiB included before the per-member allowance. null = no ceiling. */
  baseMb: number | null;
  /** Extra MiB for each active member, including the owner. Ignored when `baseMb` is null. */
  perMemberMb: number;
};

/** Resolved storage ceiling plus current usage, for clients that already read plan quotas. */
export type WorkspaceStorageQuotaStatus = WorkspaceStorageQuota & {
  /** Resolved ceiling in MiB. null = no ceiling. */
  limitMb: number | null;
  /** Resolved ceiling in bytes (1024-based MiB). null = no ceiling. */
  limitBytes: number | null;
  /** Bytes of encrypted workspace content currently stored. */
  usedBytes: number;
  /** Active workspace members, including the owner. */
  activeMemberCount: number;
};

/** HTTP error code when a write would exceed the workspace storage ceiling. */
export const PLAN_QUOTA_EXCEEDED = "PLAN_QUOTA_EXCEEDED";

/** Soft numeric limits associated with a catalog tier (null = unlimited). */
export type PlanQuotaLimits = {
  /**
   * Max members beyond the owner. The owner does not consume this quota.
   * Comparisons must use member rows excluding the workspace owner.
   */
  maxAdditionalMembers: number | null;
  /** Max shared vaults. The personal vault is separate and always allowed. */
  maxSharedVaults: number | null;
  /** Soft attachment / file storage budget in MiB. Not the enforced content ceiling. */
  maxAttachmentStorageMb: number | null;
  /** Encrypted content budget (items, notes, capsules, and files). */
  storageQuota: WorkspaceStorageQuota;
};

/** Product deployment mode (API `OKKEY_DEPLOYMENT_MODE` / web `VITE_DEPLOYMENT_MODE`). */
export type DeploymentMode = "self_hosted" | "saas";

export type PlanEntitlementOptions = {
  customOverride?: boolean | null;
  featureOverrides?: PlanFeatureOverrides | null;
  /**
   * Self-hosted:
   * - modules off → FREE matrix (plus {@link SELF_HOSTED_FREE_EXTRA} and {@link SELF_HOSTED_FREE_QUOTA_OVERRIDES})
   * - modules on → ENTERPRISE matrix (workspace `plan_tier` ignored)
   * SaaS / omitted mode: catalog `plan_tier`.
   */
  deploymentMode?: DeploymentMode | null;
  /** True only when enterprise modules were requested and successfully loaded. */
  enterpriseModulesActive?: boolean | null;
};

export const PLAN_TIERS: readonly PlanTier[] = [
  "FREE",
  "PREMIUM",
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
  "filesInCapsules",
  "monitoring",
  "storageQuotas",
] as const;

/**
 * Retired catalog token. Migration rewrites stored rows to PREMIUM.
 * This is the only reader of that token: unmigrated rows and callers that
 * still pass it are treated as PREMIUM. Custom overrides on those rows are
 * left unchanged.
 */
const LEGACY_FAMILY_PLAN_TIER = "FAMILY";

const FREE_FEATURES = {
  capsules: true,
  capsuleAccessSettings: false,
  customWorkspaceRoles: false,
  customWorkspaceProfiles: false,
  sharedVaults: true,
  additionalWorkspaceMembers: true,
  paidPlanBadge: false,
  accountRecovery: false,
  trustedContacts: false,
  filesInItems: false,
  filesInCapsules: false,
  monitoring: false,
  storageQuotas: false,
} as const satisfies Record<PlanFeature, boolean>;

const PREMIUM_FEATURES = {
  ...FREE_FEATURES,
  paidPlanBadge: true,
  accountRecovery: true,
  trustedContacts: true,
  filesInItems: true,
  filesInCapsules: true,
  monitoring: true,
  storageQuotas: true,
} as const satisfies Record<PlanFeature, boolean>;

const BUSINESS_FEATURES = {
  ...PREMIUM_FEATURES,
  capsuleAccessSettings: true,
  customWorkspaceRoles: true,
  customWorkspaceProfiles: true,
} as const satisfies Record<PlanFeature, boolean>;

/**
 * Source of truth for plan entitlements.
 * New catalog tiers or features = matrix cells only; call sites stay on {@link hasPlanFeature}.
 *
 * - FREE: capsules (text and item), shared vaults, and additional members (within quota).
 *   No files in items or capsules on SaaS, no monitoring / recovery / badge, no custom roles,
 *   profiles, or capsule access settings.
 * - Self-hosted modules off → FREE matrix plus {@link SELF_HOSTED_FREE_EXTRA}
 *   (`filesInItems`, `filesInCapsules`) and {@link SELF_HOSTED_FREE_QUOTA_OVERRIDES}.
 *   Self-hosted modules on → ENTERPRISE matrix (`plan_tier` ignored).
 * - PREMIUM: FREE plus files in items and capsules, monitoring, recovery, trusted contacts,
 *   and the paid badge.
 * - TEAM / ENTERPRISE: PREMIUM plus capsule access settings, custom roles, and custom profiles.
 *   ENTERPRISE member and shared-vault quotas are unlimited; attachment storage numbers stay on the catalog.
 */
export const PLAN_FEATURE_MATRIX: Record<PlanTier, Record<PlanFeature, boolean>> = {
  FREE: { ...FREE_FEATURES },
  PREMIUM: { ...PREMIUM_FEATURES },
  TEAM: { ...BUSINESS_FEATURES },
  ENTERPRISE: { ...BUSINESS_FEATURES },
};

/**
 * Features kept on self-hosted FREE (modules off), while SaaS FREE stays on the catalog matrix.
 * Item attachments and capsule files stay PREMIUM+ on SaaS only.
 * Capsule text and item types stay available on every tier, including SaaS FREE.
 */
export const SELF_HOSTED_FREE_EXTRA: Readonly<Partial<Record<PlanFeature, boolean>>> = {
  filesInItems: true,
  filesInCapsules: true,
};

/** 5 GiB shared base and 5 GiB per active member (TEAM / ENTERPRISE on SaaS). */
const STORAGE_PER_MEMBER_MIB = 5 * 1024;

const NO_STORAGE_CEILING: WorkspaceStorageQuota = { baseMb: null, perMemberMb: 0 };

function fixedStorageQuota(baseMb: number): WorkspaceStorageQuota {
  return { baseMb, perMemberMb: 0 };
}

function perMemberStorageQuota(sharedAndPerMemberMb: number): WorkspaceStorageQuota {
  return { baseMb: sharedAndPerMemberMb, perMemberMb: sharedAndPerMemberMb };
}

/**
 * SaaS catalog quotas. Self-hosted FREE replaces member / shared-vault cells via
 * {@link SELF_HOSTED_FREE_QUOTA_OVERRIDES}. `maxAttachmentStorageMb` is not the enforced ceiling.
 * `storageQuota` is the encrypted-content ceiling; self-hosted replaces it with no ceiling
 * in {@link getPlanQuotaLimits}.
 * null = unlimited.
 */
export const PLAN_QUOTA_LIMITS: Record<PlanTier, PlanQuotaLimits> = {
  FREE: {
    maxAdditionalMembers: 3,
    maxSharedVaults: 1,
    maxAttachmentStorageMb: 0,
    storageQuota: fixedStorageQuota(100),
  },
  PREMIUM: {
    maxAdditionalMembers: 10,
    maxSharedVaults: 1,
    maxAttachmentStorageMb: 5 * 1024,
    storageQuota: fixedStorageQuota(5 * 1024),
  },
  TEAM: {
    maxAdditionalMembers: 25,
    maxSharedVaults: 5,
    maxAttachmentStorageMb: 100 * 1024,
    storageQuota: perMemberStorageQuota(STORAGE_PER_MEMBER_MIB),
  },
  ENTERPRISE: {
    maxAdditionalMembers: null,
    maxSharedVaults: null,
    maxAttachmentStorageMb: null,
    storageQuota: perMemberStorageQuota(STORAGE_PER_MEMBER_MIB),
  },
};

/**
 * Quota cells for self-hosted FREE (modules off). SaaS FREE keeps {@link PLAN_QUOTA_LIMITS}.FREE.
 * Attachment storage is intentionally not overridden here.
 */
export const SELF_HOSTED_FREE_QUOTA_OVERRIDES: Partial<PlanQuotaLimits> = {
  maxAdditionalMembers: 10,
  maxSharedVaults: 1,
};

const PLAN_TIER_SET: ReadonlySet<string> = new Set(PLAN_TIERS);

/**
 * Fail-closed: unknown strings behave as FREE.
 * Known catalog tiers normalize to themselves.
 * The retired FAMILY token normalizes to PREMIUM (see migration).
 */
export function normalizePlanTier(planTier: string | null | undefined): PlanTier {
  if (planTier === LEGACY_FAMILY_PLAN_TIER) {
    return "PREMIUM";
  }
  if (planTier && PLAN_TIER_SET.has(planTier)) {
    return planTier as PlanTier;
  }
  return "FREE";
}

export function isPlanTier(value: string): value is PlanTier {
  return PLAN_TIER_SET.has(value);
}

/**
 * Read a tier from stored data or an API field.
 * Catalog values pass through. The retired FAMILY token is read as PREMIUM.
 * Unknown values return null so callers can reject them.
 * Entitlement checks still fail closed through {@link normalizePlanTier}.
 */
export function readPlanTier(value: string | null | undefined): PlanTier | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  if (isPlanTier(value)) {
    return value;
  }
  const normalized = normalizePlanTier(value);
  return normalized === "FREE" ? null : normalized;
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
 * Effective catalog tier used for feature / quota checks.
 * Self-hosted: modules off → FREE; modules on → ENTERPRISE (`plan_tier` ignored).
 * SaaS / omitted mode: workspace `plan_tier` (legacy FAMILY reads as PREMIUM).
 */
export function resolveEntitlementPlanTier(
  workspacePlanTier: string | null | undefined,
  options?: Pick<PlanEntitlementOptions, "deploymentMode" | "enterpriseModulesActive">,
): PlanTier {
  if (options?.deploymentMode === "self_hosted") {
    return options.enterpriseModulesActive ? "ENTERPRISE" : "FREE";
  }
  return normalizePlanTier(workspacePlanTier);
}

/**
 * Resolve whether a plan grants a feature.
 * When custom override is enabled, explicit featureOverrides win over the catalog matrix.
 * Self-hosted modules-off (effective FREE) also applies {@link SELF_HOSTED_FREE_EXTRA}.
 */
export function hasPlanFeature(
  planTier: string | null | undefined,
  feature: PlanFeature,
  options?: PlanEntitlementOptions,
): boolean {
  const effectiveTier = resolveEntitlementPlanTier(planTier, options);
  let base = PLAN_FEATURE_MATRIX[effectiveTier][feature];
  if (
    options?.deploymentMode === "self_hosted" &&
    effectiveTier === "FREE" &&
    SELF_HOSTED_FREE_EXTRA[feature] === true
  ) {
    base = true;
  }
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
  options?: Pick<PlanEntitlementOptions, "deploymentMode" | "enterpriseModulesActive">,
): PlanQuotaLimits {
  const effectiveTier = resolveEntitlementPlanTier(planTier, options);
  const catalog =
    options?.deploymentMode === "self_hosted" && effectiveTier === "FREE"
      ? { ...PLAN_QUOTA_LIMITS[effectiveTier], ...SELF_HOSTED_FREE_QUOTA_OVERRIDES }
      : PLAN_QUOTA_LIMITS[effectiveTier];
  if (options?.deploymentMode === "self_hosted") {
    return {
      ...catalog,
      storageQuota: NO_STORAGE_CEILING,
    };
  }
  return catalog;
}

/** 1024-based mebibyte, matching the storage quota unit. */
export const STORAGE_QUOTA_BYTES_PER_MIB = 1024 * 1024;

/**
 * Resolved storage ceiling in MiB.
 * A missing or empty member list still counts the owner as one member.
 * null = no ceiling.
 */
export function resolveWorkspaceStorageLimitMb(
  quota: WorkspaceStorageQuota,
  activeMemberCount: number,
): number | null {
  if (quota.baseMb === null) {
    return null;
  }
  const members = Number.isFinite(activeMemberCount) ? Math.max(1, Math.floor(activeMemberCount)) : 1;
  return quota.baseMb + quota.perMemberMb * members;
}

/** Resolved storage ceiling in bytes. null = no ceiling. */
export function resolveWorkspaceStorageLimitBytes(
  quota: WorkspaceStorageQuota,
  activeMemberCount: number,
): number | null {
  const limitMb = resolveWorkspaceStorageLimitMb(quota, activeMemberCount);
  if (limitMb === null) {
    return null;
  }
  return limitMb * STORAGE_QUOTA_BYTES_PER_MIB;
}

/**
 * True when `usedBytes - replacedBytes + additionalBytes` is strictly above the ceiling.
 * A null ceiling never exceeds. Deletes (no additional bytes) do not exceed.
 */
export function storageWriteExceedsQuota(input: {
  limitBytes: number | null;
  usedBytes: number;
  additionalBytes: number;
  replacedBytes?: number;
}): boolean {
  if (input.limitBytes === null) {
    return false;
  }
  const used = Number.isFinite(input.usedBytes) ? Math.max(0, input.usedBytes) : 0;
  const additional = Number.isFinite(input.additionalBytes) ? Math.max(0, input.additionalBytes) : 0;
  const replaced = Number.isFinite(input.replacedBytes) ? Math.max(0, input.replacedBytes ?? 0) : 0;
  const projected = used - Math.min(used, replaced) + additional;
  return projected > input.limitBytes;
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

/**
 * Catalog rank for upgrade-only plan changes (higher = more capable).
 * FREE < PREMIUM < TEAM < ENTERPRISE.
 */
export const PLAN_TIER_RANK: Record<PlanTier, number> = {
  FREE: 0,
  PREMIUM: 1,
  TEAM: 2,
  ENTERPRISE: 3,
};

export type PlanCatalogGroup = "personal" | "business";

/** Personal SaaS cards (shown only when multi-workspace / SaaS UI is enabled). */
export const PLAN_CATALOG_PERSONAL: readonly PlanTier[] = ["FREE", "PREMIUM"] as const;

/** Business cards (Team + Enterprise). Free stays on the personal tab only. */
export const PLAN_CATALOG_BUSINESS: readonly PlanTier[] = ["TEAM", "ENTERPRISE"] as const;

export function planCatalogGroupForTier(planTier: string | null | undefined): PlanCatalogGroup {
  const tier = normalizePlanTier(planTier);
  return tier === "TEAM" || tier === "ENTERPRISE" ? "business" : "personal";
}

export function planTiersForCatalogGroup(group: PlanCatalogGroup): readonly PlanTier[] {
  return group === "business" ? PLAN_CATALOG_BUSINESS : PLAN_CATALOG_PERSONAL;
}

export function comparePlanTiers(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return PLAN_TIER_RANK[normalizePlanTier(a)] - PLAN_TIER_RANK[normalizePlanTier(b)];
}

/** True when `target` is strictly above `current` on the catalog ladder. */
export function canRequestPlanUpgrade(
  current: string | null | undefined,
  target: string | null | undefined,
): boolean {
  return comparePlanTiers(target, current) > 0;
}
