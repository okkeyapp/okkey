export type WorkspaceBuiltInProfileId = "extended" | "simple";

export type ProfilePermissionScope = "all" | "selected" | "all_except";

export type ProfileFunctionActionId =
  | "archive"
  | "favorite"
  | "create_capsules"
  | "save_to_personal";

export type ProfileDatetimeMode =
  | "all_time"
  | "dates"
  | "time_only"
  | "repeat_month"
  | "repeat_week";

/** 0 — no access, 1 — full access, 2 — own objects only (get/put/archive/delete). */
export type ProfileResourceScopePermission = 0 | 1 | 2;
export type ProfileResourcePostPermission = 0 | 1;

export const PROFILE_RESOURCE_PERMISSION_NONE = 0 as const;
export const PROFILE_RESOURCE_PERMISSION_ALL = 1 as const;
export const PROFILE_RESOURCE_PERMISSION_OWN = 2 as const;

export type ProfileCategoriesPermissionRule = {
  id: string;
  kind: "categories";
  scope: ProfilePermissionScope;
  values: string[];
};

export type ProfileFieldsPermissionRule = {
  id: string;
  kind: "fields";
  scope: ProfilePermissionScope;
  values: string[];
};

export type ProfileFunctionsPermissionRule = {
  id: string;
  kind: "functions";
  scope: ProfilePermissionScope;
  values: ProfileFunctionActionId[];
};

export type ProfileDatetimePermissionRule = {
  id: string;
  kind: "datetime";
  mode: ProfileDatetimeMode;
  /** YYYY-MM-DD dates when mode is `dates`. */
  dates?: string[];
  /** Day-of-month 1..31 when mode is `repeat_month`. */
  monthDays?: number[];
  /** 1=Mon .. 7=Sun when mode is `repeat_week`. */
  weekdays?: number[];
  timeStart: string;
  timeEnd: string;
};

export type ProfilePermissionRule =
  | ProfileCategoriesPermissionRule
  | ProfileFieldsPermissionRule
  | ProfileFunctionsPermissionRule
  | ProfileDatetimePermissionRule;

export type ProfileEntriesResourcePermissions = {
  get: ProfileResourceScopePermission;
  post: ProfileResourcePostPermission;
  put: ProfileResourceScopePermission;
  archive: ProfileResourceScopePermission;
  delete: ProfileResourceScopePermission;
};

export type ProfilePermissions = {
  rules: ProfilePermissionRule[];
  entries: ProfileEntriesResourcePermissions;
};

export const PROFILE_FUNCTION_ACTION_IDS: readonly ProfileFunctionActionId[] = [
  "archive",
  "favorite",
  "create_capsules",
  "save_to_personal",
] as const;

export const PROFILE_PERMISSION_SCOPES: readonly ProfilePermissionScope[] = [
  "all",
  "selected",
  "all_except",
] as const;

export const PROFILE_DATETIME_MODES: readonly ProfileDatetimeMode[] = [
  "all_time",
  "dates",
  "time_only",
  "repeat_month",
  "repeat_week",
] as const;

/** Fixed permission rows in the profile editor (order matters). */
export const PROFILE_FIXED_RULE_KINDS = ["categories", "fields", "functions", "datetime"] as const;
export type ProfileFixedRuleKind = (typeof PROFILE_FIXED_RULE_KINDS)[number];

export const PROFILE_SCOPE_RULE_KINDS = ["categories", "fields", "functions"] as const;
export type ProfileScopeRuleKind = (typeof PROFILE_SCOPE_RULE_KINDS)[number];

function emptyEntries(): ProfileEntriesResourcePermissions {
  return {
    get: PROFILE_RESOURCE_PERMISSION_ALL,
    post: PROFILE_RESOURCE_PERMISSION_NONE,
    put: PROFILE_RESOURCE_PERMISSION_NONE,
    archive: PROFILE_RESOURCE_PERMISSION_NONE,
    delete: PROFILE_RESOURCE_PERMISSION_NONE,
  };
}

function fullEntries(): ProfileEntriesResourcePermissions {
  return {
    get: PROFILE_RESOURCE_PERMISSION_ALL,
    post: PROFILE_RESOURCE_PERMISSION_ALL,
    put: PROFILE_RESOURCE_PERMISSION_ALL,
    archive: PROFILE_RESOURCE_PERMISSION_ALL,
    delete: PROFILE_RESOURCE_PERMISSION_ALL,
  };
}

function defaultDatetimeRule(): ProfileDatetimePermissionRule {
  return {
    id: "builtin-datetime",
    kind: "datetime",
    mode: "all_time",
    timeStart: "09:00",
    timeEnd: "17:00",
  };
}

function defaultScopeRules(): ProfilePermissionRule[] {
  return [
    { id: "builtin-categories", kind: "categories", scope: "all", values: [] },
    { id: "builtin-fields", kind: "fields", scope: "all", values: [] },
    { id: "builtin-functions", kind: "functions", scope: "all", values: [] },
    defaultDatetimeRule(),
  ];
}

export function createEmptyProfilePermissions(): ProfilePermissions {
  return {
    rules: defaultScopeRules(),
    entries: emptyEntries(),
  };
}

export function createFullAccessProfilePermissions(): ProfilePermissions {
  return {
    rules: defaultScopeRules(),
    entries: fullEntries(),
  };
}

/** Simple: read records + favorite, capsules, save to personal. */
export function createSimpleProfilePermissions(): ProfilePermissions {
  return {
    rules: [
      { id: "builtin-categories", kind: "categories", scope: "all", values: [] },
      { id: "builtin-fields", kind: "fields", scope: "all", values: [] },
      {
        id: "builtin-functions",
        kind: "functions",
        scope: "selected",
        values: ["favorite", "create_capsules", "save_to_personal"],
      },
      defaultDatetimeRule(),
    ],
    entries: {
      get: PROFILE_RESOURCE_PERMISSION_ALL,
      post: PROFILE_RESOURCE_PERMISSION_NONE,
      put: PROFILE_RESOURCE_PERMISSION_NONE,
      archive: PROFILE_RESOURCE_PERMISSION_NONE,
      delete: PROFILE_RESOURCE_PERMISSION_NONE,
    },
  };
}

export function getBuiltInProfilePermissions(
  builtinId: WorkspaceBuiltInProfileId,
): ProfilePermissions {
  if (builtinId === "simple") {
    return createSimpleProfilePermissions();
  }
  return createFullAccessProfilePermissions();
}

function isScope(value: unknown): value is ProfilePermissionScope {
  return value === "all" || value === "selected" || value === "all_except";
}

function isResourceScope(value: unknown): value is ProfileResourceScopePermission {
  return value === 0 || value === 1 || value === 2;
}

function isResourcePost(value: unknown): value is ProfileResourcePostPermission {
  return value === 0 || value === 1;
}

function isFunctionAction(value: unknown): value is ProfileFunctionActionId {
  return (
    value === "archive" ||
    value === "favorite" ||
    value === "create_capsules" ||
    value === "save_to_personal"
  );
}

function isDatetimeMode(value: unknown): value is ProfileDatetimeMode {
  return (
    value === "all_time" ||
    value === "time_only" ||
    value === "dates" ||
    value === "repeat_month" ||
    value === "repeat_week"
  );
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parseEntries(value: unknown): ProfileEntriesResourcePermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyEntries();
  }
  const record = value as Record<string, unknown>;
  const get = isResourceScope(record.get) ? record.get : PROFILE_RESOURCE_PERMISSION_ALL;
  return {
    // GET no longer supports "none" in UI — coerce legacy none to all.
    get: get === PROFILE_RESOURCE_PERMISSION_NONE ? PROFILE_RESOURCE_PERMISSION_ALL : get,
    post: isResourcePost(record.post) ? record.post : PROFILE_RESOURCE_PERMISSION_NONE,
    put: isResourceScope(record.put) ? record.put : PROFILE_RESOURCE_PERMISSION_NONE,
    archive: isResourceScope(record.archive) ? record.archive : PROFILE_RESOURCE_PERMISSION_NONE,
    delete: isResourceScope(record.delete) ? record.delete : PROFILE_RESOURCE_PERMISSION_NONE,
  };
}

function parseDatetimeRule(rule: Record<string, unknown>, fallbackId: string): ProfileDatetimePermissionRule {
  const id = typeof rule.id === "string" && rule.id.trim() ? rule.id : fallbackId;
  const mode = isDatetimeMode(rule.mode) ? rule.mode : "all_time";
  const next: ProfileDatetimePermissionRule = {
    id,
    kind: "datetime",
    mode,
    timeStart: isTime(rule.timeStart) ? rule.timeStart : "09:00",
    timeEnd: isTime(rule.timeEnd) ? rule.timeEnd : "17:00",
  };
  if (mode === "dates" && Array.isArray(rule.dates)) {
    next.dates = rule.dates.filter((d): d is string => typeof d === "string");
  }
  if (mode === "repeat_month" && Array.isArray(rule.monthDays)) {
    next.monthDays = rule.monthDays.filter(
      (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 31,
    );
  }
  if (mode === "repeat_week" && Array.isArray(rule.weekdays)) {
    next.weekdays = rule.weekdays.filter(
      (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7,
    );
  }
  return next;
}

/**
 * Normalizes stored/legacy permissions into the fixed UI model:
 * categories + fields + functions + datetime, plus entries CRUD matrix.
 */
export function ensureProfilePermissions(input: unknown): ProfilePermissions {
  const base = createEmptyProfilePermissions();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return base;
  }

  const record = input as Record<string, unknown>;
  const rulesRaw = Array.isArray(record.rules) ? record.rules : [];
  const byKind = new Map<ProfileFixedRuleKind, ProfilePermissionRule>();

  let migratedEntries = parseEntries(record.entries);
  let hasExplicitEntries = record.entries != null;

  for (const raw of rulesRaw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const rule = raw as Record<string, unknown>;
    const id = typeof rule.id === "string" && rule.id.trim() ? rule.id : undefined;

    if (rule.kind === "datetime") {
      byKind.set("datetime", parseDatetimeRule(rule, id ?? "builtin-datetime"));
      continue;
    }

    if (!id || !isScope(rule.scope) || !Array.isArray(rule.values)) {
      if (rule.kind === "entries" && !("scope" in rule)) {
        migratedEntries = parseEntries(rule);
        hasExplicitEntries = true;
      }
      continue;
    }

    if (rule.kind === "categories" || rule.kind === "fields") {
      byKind.set(rule.kind, {
        id,
        kind: rule.kind,
        scope: rule.scope,
        values: rule.values.filter((value): value is string => typeof value === "string"),
      });
      continue;
    }

    if (rule.kind === "functions") {
      byKind.set("functions", {
        id,
        kind: "functions",
        scope: rule.scope,
        values: rule.values.filter(isFunctionAction),
      });
      continue;
    }

    if (rule.kind === "entries") {
      const values = rule.values.filter((value): value is string => typeof value === "string");
      const functionValues = values.filter(isFunctionAction);
      if (functionValues.length > 0 && !byKind.has("functions")) {
        byKind.set("functions", {
          id: id.replace("entries", "functions"),
          kind: "functions",
          scope: rule.scope,
          values: functionValues,
        });
      }
      if (!hasExplicitEntries) {
        migratedEntries = migrateLegacyEntryActions(values);
        hasExplicitEntries = true;
      }
    }
  }

  return {
    rules: PROFILE_FIXED_RULE_KINDS.map((kind) => {
      const existing = byKind.get(kind);
      if (existing) {
        return existing;
      }
      return base.rules.find((rule) => rule.kind === kind)!;
    }),
    entries: migratedEntries,
  };
}

function migrateLegacyEntryActions(values: string[]): ProfileEntriesResourcePermissions {
  const has = (id: string) => values.includes(id);
  const get =
    has("edit_all") || has("delete_all") || has("archive_all") || has("create")
      ? PROFILE_RESOURCE_PERMISSION_ALL
      : has("edit_own") || has("delete_own") || has("archive_own")
        ? PROFILE_RESOURCE_PERMISSION_OWN
        : PROFILE_RESOURCE_PERMISSION_ALL;
  const post = has("create") ? PROFILE_RESOURCE_PERMISSION_ALL : PROFILE_RESOURCE_PERMISSION_NONE;
  const put = has("edit_all")
    ? PROFILE_RESOURCE_PERMISSION_ALL
    : has("edit_own")
      ? PROFILE_RESOURCE_PERMISSION_OWN
      : PROFILE_RESOURCE_PERMISSION_NONE;
  const archive = has("archive_all")
    ? PROFILE_RESOURCE_PERMISSION_ALL
    : has("archive_own")
      ? PROFILE_RESOURCE_PERMISSION_OWN
      : PROFILE_RESOURCE_PERMISSION_NONE;
  const del = has("delete_all")
    ? PROFILE_RESOURCE_PERMISSION_ALL
    : has("delete_own")
      ? PROFILE_RESOURCE_PERMISSION_OWN
      : PROFILE_RESOURCE_PERMISSION_NONE;

  return { get, post, put, archive, delete: del };
}

export interface WorkspaceProfileSummary {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "custom";
  builtinId?: WorkspaceBuiltInProfileId;
  applicationCount: number;
}

/** `GET /workspaces/:workspaceId/profiles` built-in profile item (open-core). */
export interface WorkspaceBuiltInProfileDto {
  id: string;
  kind: "builtin";
  builtin_id: WorkspaceBuiltInProfileId;
  name: string;
  description: string;
  application_count: number;
}

/** `GET /workspaces/:workspaceId/profiles` success body (open-core). */
export interface WorkspaceBuiltInProfilesListResponseDto {
  profiles: WorkspaceBuiltInProfileDto[];
}

/** One vault content-access profile for the current member. */
export interface MeVaultProfileEntryDto {
  vaultId: string;
  profileId: string;
  permissions: ProfilePermissions;
}

/** `GET /workspaces/:workspaceId/me/vault-profiles` success body. */
export interface MeVaultProfilesResponseDto {
  workspaceId: string;
  vaults: MeVaultProfileEntryDto[];
}

function scopeAllows(scope: ProfilePermissionScope, values: readonly string[], candidate: string): boolean {
  if (scope === "all") {
    return true;
  }
  // selected + [] → deny all; all_except + [] → allow all (nothing excluded).
  if (values.length === 0) {
    return scope === "all_except";
  }
  const selected = new Set(values);
  if (scope === "selected") {
    return selected.has(candidate);
  }
  return !selected.has(candidate);
}

function findRule<T extends ProfilePermissionRule["kind"]>(
  permissions: ProfilePermissions,
  kind: T,
): Extract<ProfilePermissionRule, { kind: T }> | undefined {
  return permissions.rules.find((rule): rule is Extract<ProfilePermissionRule, { kind: T }> => rule.kind === kind);
}

function allowsResourceScope(
  level: ProfileResourceScopePermission,
  isOwn: boolean | undefined,
): boolean {
  if (level === PROFILE_RESOURCE_PERMISSION_NONE) {
    return false;
  }
  if (level === PROFILE_RESOURCE_PERMISSION_ALL) {
    return true;
  }
  return Boolean(isOwn);
}

export type ProfilePermitsContext = {
  permissions: ProfilePermissions;
  /** Current user id; required for `own` scope checks. */
  userId?: string | null;
  /** Creator of the item from first ITEM_CREATE actorId. */
  itemCreatedByUserId?: string | null;
  /** Wall-clock for datetime window evaluation (defaults to Date.now()). */
  nowMs?: number;
};

function isOwnItem(ctx: ProfilePermitsContext): boolean {
  if (!ctx.userId || !ctx.itemCreatedByUserId) {
    return false;
  }
  return ctx.userId === ctx.itemCreatedByUserId;
}

export function profileAllowsEntriesGet(ctx: ProfilePermitsContext): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  const level = permissions.entries.get;
  if (level === PROFILE_RESOURCE_PERMISSION_NONE) {
    return false;
  }
  if (level === PROFILE_RESOURCE_PERMISSION_ALL) {
    return true;
  }
  // Own-scope: if creator is unknown, do not hide the item (client metadata may lag).
  if (ctx.itemCreatedByUserId == null || ctx.itemCreatedByUserId === "") {
    return true;
  }
  return isOwnItem(ctx);
}

export function profileAllowsEntriesPost(ctx: ProfilePermitsContext): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  return permissions.entries.post === PROFILE_RESOURCE_PERMISSION_ALL;
}

export function profileAllowsEntriesPut(ctx: ProfilePermitsContext): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  return allowsResourceScope(permissions.entries.put, isOwnItem(ctx));
}

export function profileAllowsEntriesArchive(ctx: ProfilePermitsContext): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  return allowsResourceScope(permissions.entries.archive, isOwnItem(ctx));
}

export function profileAllowsEntriesDelete(ctx: ProfilePermitsContext): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  return allowsResourceScope(permissions.entries.delete, isOwnItem(ctx));
}

/**
 * Category visibility for viewing existing items.
 * Creation (POST) intentionally ignores this rule — all categories are available when post is allowed.
 */
export function profileAllowsCategory(ctx: ProfilePermitsContext, categoryId: string): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  const rule = findRule(permissions, "categories");
  if (!rule) {
    return true;
  }
  return scopeAllows(rule.scope, rule.values, categoryId);
}

/**
 * Field-type visibility for viewing existing items.
 * Creation (POST) intentionally ignores this rule.
 */
export function profileAllowsFieldType(ctx: ProfilePermitsContext, fieldType: string): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  const rule = findRule(permissions, "fields");
  if (!rule) {
    return true;
  }
  return scopeAllows(rule.scope, rule.values, fieldType);
}

export function profileAllowsFunction(
  ctx: ProfilePermitsContext,
  action: ProfileFunctionActionId,
): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  const rule = findRule(permissions, "functions");
  if (!rule) {
    return true;
  }
  return scopeAllows(rule.scope, rule.values, action);
}

function parseHm(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function inTimeRange(now: Date, timeStart: string, timeEnd: string): boolean {
  const start = parseHm(timeStart);
  const end = parseHm(timeEnd);
  if (!start || !end) {
    return true;
  }
  const nowMinutes = minutesOfDay(now);
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  if (startMinutes === endMinutes) {
    return true;
  }
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

function isoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 1=Mon .. 7=Sun (ISO). */
function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function profileAllowsDatetime(ctx: ProfilePermitsContext, nowMs = ctx.nowMs ?? Date.now()): boolean {
  const permissions = ensureProfilePermissions(ctx.permissions);
  const rule = findRule(permissions, "datetime") as ProfileDatetimePermissionRule | undefined;
  if (!rule || rule.mode === "all_time") {
    return true;
  }
  const now = new Date(nowMs);
  if (!inTimeRange(now, rule.timeStart, rule.timeEnd)) {
    return false;
  }
  if (rule.mode === "time_only") {
    return true;
  }
  if (rule.mode === "dates") {
    const allowed = rule.dates ?? [];
    if (allowed.length === 0) {
      return true;
    }
    return allowed.includes(isoDateLocal(now));
  }
  if (rule.mode === "repeat_month") {
    const days = rule.monthDays ?? [];
    if (days.length === 0) {
      return true;
    }
    return days.includes(now.getDate());
  }
  if (rule.mode === "repeat_week") {
    const days = rule.weekdays ?? [];
    if (days.length === 0) {
      return true;
    }
    return days.includes(isoWeekday(now));
  }
  return true;
}

/**
 * Combined view gate: entries.get + datetime + category.
 * Field-level filtering is applied separately after decrypt.
 */
export function profileAllowsItemView(
  ctx: ProfilePermitsContext,
  categoryId: string,
): boolean {
  return (
    profileAllowsEntriesGet(ctx) &&
    profileAllowsDatetime(ctx) &&
    profileAllowsCategory(ctx, categoryId)
  );
}

export function getProfileEntries(ctx: ProfilePermitsContext): ProfileEntriesResourcePermissions {
  return ensureProfilePermissions(ctx.permissions).entries;
}

