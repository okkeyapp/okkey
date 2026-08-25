import type { EntityId } from "./entity-id.js";

export type CapsuleAllowMode = "none" | "all" | "selected" | "all_except";
export type CapsuleAccessAudience = "all_users" | "workspace_members_only";

/** Workspace-level capsule policies (admin settings). */
export interface WorkspaceCapsulePolicies {
  allowMode: CapsuleAllowMode;
  /** Member user ids for `selected` / `all_except`. */
  allowMemberIds: EntityId[];
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

export const DEFAULT_WORKSPACE_CAPSULE_POLICIES: WorkspaceCapsulePolicies = {
  allowMode: "all",
  allowMemberIds: [],
  forceMaxViews: 0,
  requireTimeDeactivation: false,
  requireAccess: false,
  accessAudience: "all_users",
  requirePassword: false,
  passwordAttemptLimit: 0,
  requireApproval: false,
};

/** Snake_case wire shape for workspace settings API. */
export interface WorkspaceCapsulePoliciesDto {
  allow_mode: CapsuleAllowMode;
  allow_member_ids: EntityId[];
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
    return { ...DEFAULT_WORKSPACE_CAPSULE_POLICIES, allowMemberIds: [] };
  }
  const allowMode = normalizeAllowMode(dto.allow_mode);
  const accessAudience = normalizeAccessAudience(dto.access_audience);
  return {
    allowMode,
    allowMemberIds: normalizeMemberIds(dto.allow_member_ids),
    forceMaxViews: normalizeNonNegativeInt(dto.force_max_views, 0),
    requireTimeDeactivation: Boolean(dto.require_time_deactivation),
    requireAccess: Boolean(dto.require_access),
    accessAudience,
    requirePassword: Boolean(dto.require_password),
    passwordAttemptLimit: normalizeNonNegativeInt(dto.password_attempt_limit, 0),
    requireApproval: Boolean(dto.require_approval),
  };
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
