import type { CapsuleType } from "./capsules.js";
import type { EntityId } from "./entity-id.js";

export type CapsuleAllowMode = "none" | "all" | "selected" | "all_except";
export type CapsuleAccessAudience = "all_users" | "workspace_members_only";

export const ALL_CAPSULE_TYPES: readonly CapsuleType[] = ["text", "file", "item"] as const;

/** Workspace-level capsule policies (admin settings). */
export interface WorkspaceCapsulePolicies {
  allowMode: CapsuleAllowMode;
  /** Member user ids for `selected` / `all_except`. */
  allowMemberIds: EntityId[];
  /**
   * Capsule content types members may create. Empty = none.
   * Default: all types selected.
   */
  allowedCapsuleTypes: CapsuleType[];
  /** 0 = do not force a view limit. */
  forceMaxViews: number;
  requireTimeDeactivation: boolean;
  requireAccess: boolean;
  accessAudience: CapsuleAccessAudience;
  requirePassword: boolean;
  /** 0 = do not force attempt limit. */
  passwordAttemptLimit: number;
  requireApproval: boolean;
}

/** EE-only access policy fields — FREE always uses these defaults at runtime. */
export const CAPSULE_ACCESS_POLICY_DEFAULTS = {
  requireTimeDeactivation: false,
  requireAccess: false,
  accessAudience: "all_users" as CapsuleAccessAudience,
  requirePassword: false,
  passwordAttemptLimit: 0,
  requireApproval: false,
} as const;

export const DEFAULT_WORKSPACE_CAPSULE_POLICIES: WorkspaceCapsulePolicies = {
  allowMode: "all",
  allowMemberIds: [],
  allowedCapsuleTypes: [...ALL_CAPSULE_TYPES],
  forceMaxViews: 0,
  ...CAPSULE_ACCESS_POLICY_DEFAULTS,
};

/** Snake_case wire shape for workspace settings API. */
export interface WorkspaceCapsulePoliciesDto {
  allow_mode: CapsuleAllowMode;
  allow_member_ids: EntityId[];
  allowed_capsule_types: CapsuleType[];
  force_max_views: number;
  require_time_deactivation: boolean;
  require_access: boolean;
  access_audience: CapsuleAccessAudience;
  require_password: boolean;
  password_attempt_limit: number;
  require_approval: boolean;
}

export function workspaceCapsulePoliciesToDto(
  policies: WorkspaceCapsulePolicies,
): WorkspaceCapsulePoliciesDto {
  return {
    allow_mode: policies.allowMode,
    allow_member_ids: [...policies.allowMemberIds],
    allowed_capsule_types: [...policies.allowedCapsuleTypes],
    force_max_views: policies.forceMaxViews,
    require_time_deactivation: policies.requireTimeDeactivation,
    require_access: policies.requireAccess,
    access_audience: policies.accessAudience,
    require_password: policies.requirePassword,
    password_attempt_limit: policies.passwordAttemptLimit,
    require_approval: policies.requireApproval,
  };
}

export function workspaceCapsulePoliciesFromDto(
  dto: Partial<WorkspaceCapsulePoliciesDto> | null | undefined,
): WorkspaceCapsulePolicies {
  if (!dto || typeof dto !== "object") {
    return {
      ...DEFAULT_WORKSPACE_CAPSULE_POLICIES,
      allowMemberIds: [],
      allowedCapsuleTypes: [...ALL_CAPSULE_TYPES],
    };
  }
  const allowMode = normalizeAllowMode(dto.allow_mode);
  const accessAudience = normalizeAccessAudience(dto.access_audience);
  return {
    allowMode,
    allowMemberIds: normalizeMemberIds(dto.allow_member_ids),
    allowedCapsuleTypes: normalizeAllowedCapsuleTypes(dto.allowed_capsule_types),
    forceMaxViews: normalizeNonNegativeInt(dto.force_max_views, 0),
    requireTimeDeactivation: Boolean(dto.require_time_deactivation),
    requireAccess: Boolean(dto.require_access),
    accessAudience,
    requirePassword: Boolean(dto.require_password),
    passwordAttemptLimit: normalizeNonNegativeInt(dto.password_attempt_limit, 0),
    requireApproval: Boolean(dto.require_approval),
  };
}

/**
 * FREE (no `capsuleAccessSettings`) ignores stored EE overrides and applies defaults.
 * Core fields (`allowMode`, members, types, `forceMaxViews`) stay as stored.
 */
export function resolveEffectiveCapsulePolicies(
  policies: WorkspaceCapsulePolicies,
  accessSettingsEnabled: boolean,
): WorkspaceCapsulePolicies {
  if (accessSettingsEnabled) {
    return policies;
  }
  return {
    ...policies,
    ...CAPSULE_ACCESS_POLICY_DEFAULTS,
  };
}

/**
 * When patching settings without access-settings entitlement, keep stored EE fields
 * (so an upgrade can restore them) and only apply Core-editable fields from the patch.
 */
export function mergeCapsulePoliciesForPlan(
  existing: WorkspaceCapsulePolicies,
  patch: WorkspaceCapsulePolicies,
  accessSettingsEnabled: boolean,
): WorkspaceCapsulePolicies {
  if (accessSettingsEnabled) {
    return patch;
  }
  return {
    ...patch,
    requireTimeDeactivation: existing.requireTimeDeactivation,
    requireAccess: existing.requireAccess,
    accessAudience: existing.accessAudience,
    requirePassword: existing.requirePassword,
    passwordAttemptLimit: existing.passwordAttemptLimit,
    requireApproval: existing.requireApproval,
  };
}

export function isCapsuleTypeAllowed(
  policies: WorkspaceCapsulePolicies,
  type: CapsuleType,
): boolean {
  return policies.allowedCapsuleTypes.includes(type);
}

function normalizeAllowMode(value: unknown): CapsuleAllowMode {
  if (value === "none" || value === "all" || value === "selected" || value === "all_except") {
    return value;
  }
  return DEFAULT_WORKSPACE_CAPSULE_POLICIES.allowMode;
}

function normalizeAccessAudience(value: unknown): CapsuleAccessAudience {
  if (value === "all_users" || value === "workspace_members_only") {
    return value;
  }
  return DEFAULT_WORKSPACE_CAPSULE_POLICIES.accessAudience;
}

function normalizeMemberIds(value: unknown): EntityId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: EntityId[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizeAllowedCapsuleTypes(value: unknown): CapsuleType[] {
  if (value === undefined) {
    return [...ALL_CAPSULE_TYPES];
  }
  if (!Array.isArray(value)) {
    return [...ALL_CAPSULE_TYPES];
  }
  const allowed: CapsuleType[] = [];
  const seen = new Set<CapsuleType>();
  for (const item of value) {
    if (item !== "text" && item !== "file" && item !== "item") continue;
    if (seen.has(item)) continue;
    seen.add(item);
    allowed.push(item);
  }
  // Preserve catalog order.
  return ALL_CAPSULE_TYPES.filter((type) => seen.has(type));
}

function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

export function isCapsuleAllowedForMember(
  policies: WorkspaceCapsulePolicies,
  userId: string | null | undefined,
): boolean {
  if (policies.allowMode === "all") {
    return true;
  }
  if (policies.allowMode === "none") {
    return false;
  }
  if (!userId) {
    return false;
  }
  const listed = policies.allowMemberIds.includes(userId);
  if (policies.allowMode === "selected") {
    return listed;
  }
  return !listed;
}
