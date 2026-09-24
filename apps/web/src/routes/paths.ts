/**
 * Single source of truth for browser URL paths (React Router).
 * Import these instead of string literals so redirects, guards, and links stay aligned.
 */

/** App root */
export const ROOT_PATH = "/";

// --- Auth (email / OTP / 2FA) — often wrapped with GuestAuthOnly when bearer must be absent ---

export const AUTH_EMAIL_PATH = "/auth/email";
export const AUTH_OTP_PATH = "/auth/otp";
export const AUTH_TWO_FACTOR_PATH = "/auth/two-factor";
export const AUTH_WEBAUTHN_PATH = "/auth/webauthn";

/** @deprecated Old URL; router redirects to {@link ACCOUNT_NEW_PATH} */
export const AUTH_REGISTRATION_LEGACY_PATH = "/auth/registration";

// --- Account (vault lock, registration, marketing restore) ---

export const ACCOUNT_LOCK_PATH = "/account/lock";
export const ACCOUNT_DEVICE_PENDING_PATH = "/account/device-pending";
export const ACCOUNT_NEW_PATH = "/account/new";
export const ACCOUNT_RESTORE_PATH = "/account/restore";

/** @deprecated Old URL; router redirects to {@link ACCOUNT_LOCK_PATH} */
export const UNLOCK_PASSWORD_LEGACY_PATH = "/unlock/password";

// --- Main shell (session + unlocked vault via ProtectedVaultLayout) ---

export const WORKSPACES_PATH = "/workspaces";

/** Current workspace may be passed explicitly; otherwise read from per-user localStorage. */
export const WORKSPACE_QUERY_PARAM = "workspace";

export const ITEMS_PATH = "/items";

/**
 * `/items` scope: at most one of `vault`/`vaultKind`, `folder`, `category`, or `search` in the URL.
 * The shell (`WorkspaceRoutesLayout`) normalizes conflicts (search clears vault/vaultKind/folder/category; vault clears folder).
 * Sidebar “active” rules treat “All items” as active only when none of these are set.
 */
export const VAULT_QUERY_PARAM = "vault";
/** Monitoring vault-scope on `/items`: personal vault(s) or all shared vaults (mutually exclusive with `vault`). */
export const VAULT_KIND_QUERY_PARAM = "vaultKind";
export const FOLDER_QUERY_PARAM = "folder";
export const CATEGORY_QUERY_PARAM = "category";
/** Selected item row on `/items` (master–detail); coexists with `workspace`, `vault`, or `folder`. */
export const ITEM_QUERY_PARAM = "item";

export type ItemsVaultKind = "personal" | "shared";

export function isItemsVaultKind(raw: string): raw is ItemsVaultKind {
  const x = raw.trim().toLowerCase();
  return x === "personal" || x === "shared";
}

/** Non-default list filter on `/items` (`all` omits this param). */
export const FILTER_QUERY_PARAM = "filter";
export const FILTER_QUERY_FAVOURITES = "favourites";
export const FILTER_QUERY_ARCHIVED = "archived";
export const FILTER_QUERY_DELETED = "deleted";
export const FILTER_QUERY_REUSED = "reused";
export const FILTER_QUERY_STRONG = "strong";
export const FILTER_QUERY_MEDIUM = "medium";
export const FILTER_QUERY_WEAK = "weak";
export const FILTER_QUERY_STALE = "stale";
export const FILTER_QUERY_COMPROMISED = "compromised";
export const FILTER_QUERY_TWO_FACTOR_GAP = "2fa-gap";
export const FILTER_QUERY_PASSKEY_GAP = "passkey-gap";

export type MonitoringItemsFilter =
  | typeof FILTER_QUERY_REUSED
  | typeof FILTER_QUERY_STRONG
  | typeof FILTER_QUERY_MEDIUM
  | typeof FILTER_QUERY_WEAK
  | typeof FILTER_QUERY_STALE
  | typeof FILTER_QUERY_COMPROMISED
  | typeof FILTER_QUERY_TWO_FACTOR_GAP
  | typeof FILTER_QUERY_PASSKEY_GAP;

export function isMonitoringItemsFilter(raw: string): raw is MonitoringItemsFilter {
  const x = raw.trim().toLowerCase();
  return (
    x === FILTER_QUERY_REUSED ||
    x === FILTER_QUERY_STRONG ||
    x === FILTER_QUERY_MEDIUM ||
    x === FILTER_QUERY_WEAK ||
    x === FILTER_QUERY_STALE ||
    x === FILTER_QUERY_COMPROMISED ||
    x === FILTER_QUERY_TWO_FACTOR_GAP ||
    x === FILTER_QUERY_PASSKEY_GAP
  );
}

/** Build `/items?filter=…` for Monitoring “Show” links (keeps workspace query). */
export function itemsPathWithMonitoringFilter(
  prev: URLSearchParams,
  filter: MonitoringItemsFilter,
  options?: { vaultKind?: ItemsVaultKind | "all" },
): string {
  const next = new URLSearchParams(prev);
  next.delete(VAULT_QUERY_PARAM);
  next.delete(FOLDER_QUERY_PARAM);
  next.delete(CATEGORY_QUERY_PARAM);
  next.delete(SEARCH_QUERY_PARAM);
  next.delete(ITEM_QUERY_PARAM);
  next.set(FILTER_QUERY_PARAM, filter);
  const kind = options?.vaultKind;
  if (kind === "personal" || kind === "shared") {
    next.set(VAULT_KIND_QUERY_PARAM, kind);
  } else {
    next.delete(VAULT_KIND_QUERY_PARAM);
  }
  const qs = next.toString();
  return qs ? `${ITEMS_PATH}?${qs}` : ITEMS_PATH;
}

/** Non-default sort on `/items` (default `date-desc` omits this param). */
export const SORT_QUERY_PARAM = "sort";
export const SORT_QUERY_DATE_DESC = "date-desc";
export const SORT_QUERY_DATE_ASC = "date-asc";
export const SORT_QUERY_ALPH_ASC = "alph-asc";
export const SORT_QUERY_ALPH_DESC = "alph-desc";

/** Full-text-ish search on `/items` (top bar); coexists with other `?` params. */
export const SEARCH_QUERY_PARAM = "search";

/** Drop `?item=` when one of the deleted items is currently open in the detail panel. */
export function withoutOpenItemQueryParam(
  prev: URLSearchParams,
  itemIds: readonly string[],
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const activeItemId = next.get(ITEM_QUERY_PARAM)?.trim() ?? "";
  if (activeItemId && itemIds.includes(activeItemId)) {
    next.delete(ITEM_QUERY_PARAM);
  }
  return next;
}

export type ApplyWorkspaceSearchQueryOptions = {
  /** Drop selected item row (mobile list-only view). */
  clearItem?: boolean;
};

/** Apply workspace shell search query; clears vault/folder/filter scope like the top bar Enter handler. */
export function applyWorkspaceSearchToParams(
  prev: URLSearchParams,
  raw: string,
  options?: ApplyWorkspaceSearchQueryOptions,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const trimmed = raw.trim();
  if (trimmed) {
    next.set(SEARCH_QUERY_PARAM, trimmed);
    next.delete(VAULT_QUERY_PARAM);
    next.delete(VAULT_KIND_QUERY_PARAM);
    next.delete(FOLDER_QUERY_PARAM);
    next.delete(CATEGORY_QUERY_PARAM);
    next.delete(FILTER_QUERY_PARAM);
    if (options?.clearItem) {
      next.delete(ITEM_QUERY_PARAM);
    }
  } else {
    next.delete(SEARCH_QUERY_PARAM);
  }
  return next;
}

export function itemsPathWithVault(vaultId: string): string {
  return `${ITEMS_PATH}?${new URLSearchParams({ [VAULT_QUERY_PARAM]: vaultId }).toString()}`;
}

/** Same path shape as vault filter; use for folder nodes in `OkkeySidebarFolderTreeNode.to`. */
export function itemsPathWithFolder(folderId: string): string {
  return `${ITEMS_PATH}?${new URLSearchParams({ [FOLDER_QUERY_PARAM]: folderId }).toString()}`;
}

/**
 * Build `/items?…` from the current query, mutating a copy. Callers decide what to keep; typical
 * merges preserve {@link ITEM_QUERY_PARAM} and `sort` while adjusting `vault`, `folder`, `search`,
 * and/or `filter` (see {@link itemsPathAllWorkspaceMerged} vs vault/folder helpers).
 */
export type MergeItemsLocationOptions = {
  /** Drop selected item row (mobile list-only view). */
  clearItem?: boolean;
};

function applyMergeItemsLocationOptions(next: URLSearchParams, options?: MergeItemsLocationOptions) {
  if (options?.clearItem) {
    next.delete(ITEM_QUERY_PARAM);
  }
}

export function mergeItemsLocationSearch(
  current: URLSearchParams,
  mutate: (next: URLSearchParams) => void,
  options?: MergeItemsLocationOptions,
): string {
  const next = new URLSearchParams(current);
  mutate(next);
  applyMergeItemsLocationOptions(next, options);
  const s = next.toString();
  return s ? `${ITEMS_PATH}?${s}` : ITEMS_PATH;
}

export function itemsPathWithVaultMerged(
  current: URLSearchParams,
  vaultId: string,
  options?: MergeItemsLocationOptions,
): string {
  return mergeItemsLocationSearch(
    current,
    (n) => {
      n.set(VAULT_QUERY_PARAM, vaultId);
      n.delete(VAULT_KIND_QUERY_PARAM);
      n.delete(FOLDER_QUERY_PARAM);
      n.delete(CATEGORY_QUERY_PARAM);
      n.delete(SEARCH_QUERY_PARAM);
      n.delete(FILTER_QUERY_PARAM);
    },
    options,
  );
}

export function itemsPathWithFolderMerged(
  current: URLSearchParams,
  folderId: string,
  options?: MergeItemsLocationOptions,
): string {
  return mergeItemsLocationSearch(
    current,
    (n) => {
      n.set(FOLDER_QUERY_PARAM, folderId);
      n.delete(VAULT_QUERY_PARAM);
      n.delete(VAULT_KIND_QUERY_PARAM);
      n.delete(CATEGORY_QUERY_PARAM);
      n.delete(SEARCH_QUERY_PARAM);
      n.delete(FILTER_QUERY_PARAM);
    },
    options,
  );
}

export function itemsPathWithCategoryMerged(
  current: URLSearchParams,
  categoryId: string,
  options?: MergeItemsLocationOptions,
): string {
  return mergeItemsLocationSearch(
    current,
    (n) => {
      n.set(CATEGORY_QUERY_PARAM, categoryId);
      n.delete(VAULT_QUERY_PARAM);
      n.delete(VAULT_KIND_QUERY_PARAM);
      n.delete(FOLDER_QUERY_PARAM);
      n.delete(SEARCH_QUERY_PARAM);
      n.delete(FILTER_QUERY_PARAM);
    },
    options,
  );
}

/** Sidebar “All items”: drop vault, folder, category, search, and list filter; keep `item` and `sort`. */
export function itemsPathAllWorkspaceMerged(current: URLSearchParams, options?: MergeItemsLocationOptions): string {
  return mergeItemsLocationSearch(
    current,
    (n) => {
      n.delete(VAULT_QUERY_PARAM);
      n.delete(VAULT_KIND_QUERY_PARAM);
      n.delete(FOLDER_QUERY_PARAM);
      n.delete(CATEGORY_QUERY_PARAM);
      n.delete(SEARCH_QUERY_PARAM);
      n.delete(FILTER_QUERY_PARAM);
    },
    options,
  );
}

export const CAPSULES_PATH = "/capsules";
export const CAPSULE_PUBLIC_PATH_PATTERN = "/capsule/:capsuleId";

export function isCapsulePublicPathname(pathname: string): boolean {
  return pathname === "/capsule" || pathname.startsWith("/capsule/");
}

export const MONITORING_PATH = "/monitoring";
export const TOOLS_PATH = "/tools";
export const SETTINGS_PATH = "/settings";
export const SETTINGS_MAIN_PATH = `${SETTINGS_PATH}/main`;
/**
 * Legacy short path — router redirects to {@link devicesSettingsHref}.
 * Prefer the canonical popup URL in emails / docs / CTAs.
 */
export const SETTINGS_DEVICES_PATH = `${SETTINGS_PATH}/devices`;

/** Canonical devices settings deep-link: `/items?popup=settings|devices`. */
export const DEVICES_SETTINGS_POPUP_QUERY = "settings|devices";
export const DEVICES_SETTINGS_HREF = `${ITEMS_PATH}?popup=${DEVICES_SETTINGS_POPUP_QUERY}`;

export function devicesSettingsHref(): string {
  return DEVICES_SETTINGS_HREF;
}

export type ToolsSectionId = "generator" | "import" | "export";

export const DEFAULT_TOOLS_SECTION: ToolsSectionId = "generator";

export const TOOLS_SECTIONS: readonly ToolsSectionId[] = ["generator", "import", "export"];

const TOOLS_SECTION_SLUGS: Record<ToolsSectionId, string> = {
  generator: "generator",
  import: "import",
  export: "export",
};

const TOOLS_SLUG_TO_SECTION: Record<string, ToolsSectionId> = Object.fromEntries(
  Object.entries(TOOLS_SECTION_SLUGS).map(([section, slug]) => [slug, section as ToolsSectionId]),
) as Record<string, ToolsSectionId>;

export const TOOLS_GENERATOR_PATH = `${TOOLS_PATH}/${TOOLS_SECTION_SLUGS.generator}`;

export function toolsSectionSlug(section: ToolsSectionId = DEFAULT_TOOLS_SECTION): string {
  return TOOLS_SECTION_SLUGS[section];
}

export function toolsPath(section: ToolsSectionId = DEFAULT_TOOLS_SECTION): string {
  return `${TOOLS_PATH}/${toolsSectionSlug(section)}`;
}

export function toolsSectionFromSlug(slug: string): ToolsSectionId | null {
  return TOOLS_SLUG_TO_SECTION[slug] ?? null;
}

export function toolsSectionFromPathname(pathname: string): ToolsSectionId | null {
  if (pathname === TOOLS_PATH) {
    return null;
  }
  const prefix = `${TOOLS_PATH}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const slug = pathname.slice(prefix.length).split("/")[0]?.trim() ?? "";
  return toolsSectionFromSlug(slug);
}

export function isToolsPathname(pathname: string): boolean {
  return pathname === TOOLS_PATH || pathname.startsWith(`${TOOLS_PATH}/`);
}

/** @deprecated Query-param settings URLs; use {@link settingsPath} with path segments. */
export const SETTINGS_SECTION_QUERY_PARAM = "section";

export type WorkspaceSettingsSectionId =
  | "general"
  | "items"
  | "capsules"
  | "roles"
  | "profiles"
  | "members"
  | "vaults"
  | "plan"
  | "billing";

export const DEFAULT_WORKSPACE_SETTINGS_SECTION: WorkspaceSettingsSectionId = "general";

const SETTINGS_SECTION_SLUGS: Record<WorkspaceSettingsSectionId, string> = {
  general: "main",
  items: "items",
  capsules: "capsules",
  roles: "roles",
  profiles: "profiles",
  members: "members",
  vaults: "vaults",
  plan: "plan",
  billing: "billing",
};

const SETTINGS_SLUG_TO_SECTION: Record<string, WorkspaceSettingsSectionId> = Object.fromEntries(
  Object.entries(SETTINGS_SECTION_SLUGS).map(([section, slug]) => [slug, section as WorkspaceSettingsSectionId]),
) as Record<string, WorkspaceSettingsSectionId>;

export function settingsSectionSlug(section: WorkspaceSettingsSectionId = DEFAULT_WORKSPACE_SETTINGS_SECTION): string {
  return SETTINGS_SECTION_SLUGS[section];
}

export function settingsPath(section: WorkspaceSettingsSectionId = DEFAULT_WORKSPACE_SETTINGS_SECTION): string {
  return `${SETTINGS_PATH}/${settingsSectionSlug(section)}`;
}

export function settingsSectionFromSlug(slug: string): WorkspaceSettingsSectionId | null {
  return SETTINGS_SLUG_TO_SECTION[slug] ?? null;
}

export function settingsSectionFromPathname(pathname: string): WorkspaceSettingsSectionId | null {
  if (pathname === SETTINGS_PATH) {
    return null;
  }
  const prefix = `${SETTINGS_PATH}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const slug = pathname.slice(prefix.length).split("/")[0]?.trim() ?? "";
  return settingsSectionFromSlug(slug);
}

export function isSettingsPathname(pathname: string): boolean {
  return pathname === SETTINGS_PATH || pathname.startsWith(`${SETTINGS_PATH}/`);
}

/** Top-level app shell routes (each validates workspace access). */
export const WORKSPACE_APP_SHELL_PATHS = [
  ITEMS_PATH,
  CAPSULES_PATH,
  MONITORING_PATH,
  TOOLS_PATH,
  SETTINGS_PATH,
] as const;

export type WorkspaceAppShellPath = (typeof WORKSPACE_APP_SHELL_PATHS)[number];

/** @deprecated Old bookmark URL; router redirects into {@link ITEMS_PATH} with workspace query. */
export const LEGACY_WORKSPACE_DETAIL_ROUTE_PARAM = "workspaceId";
export const LEGACY_WORKSPACE_DETAIL_PATH_PATTERN =
  `${WORKSPACES_PATH}/:${LEGACY_WORKSPACE_DETAIL_ROUTE_PARAM}` as const;

/** Guest invite landing (enterprise); token is opaque base64url. */
export const INVITE_PATH_PATTERN = "/invite/:token" as const;

export function invitePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`;
}

export function isInvitePathname(pathname: string): boolean {
  return pathname === "/invite" || pathname.startsWith("/invite/");
}

/** Public privacy policy (short self-hosted in Core; enterprise may replace via legal module). */
export const PRIVACY_POLICY_PATH = "/legal/privacy-policy";

/** @deprecated Old login link; router redirects to {@link PRIVACY_POLICY_PATH} */
export const PRIVACY_POLICY_LEGACY_PATH = "/privacy";

export function isPrivacyPolicyPathname(pathname: string): boolean {
  return pathname === PRIVACY_POLICY_PATH || pathname === PRIVACY_POLICY_LEGACY_PATH;
}

/** Default post-login / post-unlock target when no explicit ?redirect= */
export const DEFAULT_AUTHENTICATED_PATH = WORKSPACES_PATH;

// --- Dev UI gallery ---

export const DEV_UI_BASE_PATH = "/dev/ui";

export type DevUiGallerySegment =
  | "sidebar"
  | "button"
  | "input"
  | "switch"
  | "select"
  | "control-grouping"
  | "spinner"
  | "workspace-tile"
  | "popup"
  | "key-form"
  | "alert"
  | "breadcrumb"
  | "tooltip"
  | "favicon";

export function devUiGalleryPath(segment?: DevUiGallerySegment): string {
  if (!segment) {
    return DEV_UI_BASE_PATH;
  }
  return `${DEV_UI_BASE_PATH}/${segment}`;
}

/** `/dev/ui` or nested gallery path */
export function isDevUiPathname(pathname: string): boolean {
  return pathname === DEV_UI_BASE_PATH || pathname.startsWith(`${DEV_UI_BASE_PATH}/`);
}

export function workspaceShellPath(pathname: WorkspaceAppShellPath, workspaceId: string): string {
  const q = new URLSearchParams({ [WORKSPACE_QUERY_PARAM]: workspaceId });
  return `${pathname}?${q.toString()}`;
}

export function isWorkspaceAppShellPathname(pathname: string): pathname is WorkspaceAppShellPath {
  if (isSettingsPathname(pathname) || isToolsPathname(pathname)) {
    return true;
  }
  return (WORKSPACE_APP_SHELL_PATHS as readonly string[]).includes(pathname);
}

/**
 * Master-password lock screen with redirect query (value must already be encoded for query safety).
 * @example accountLockWithRedirectQuery(encodeURIComponent(`${WORKSPACES_PATH}/ws-1`))
 */
export function accountLockWithRedirectQuery(encodedRedirect: string): string {
  return `${ACCOUNT_LOCK_PATH}?redirect=${encodedRedirect}`;
}

/** Device approval wait screen; optional redirect preserved for post-approval unlock. */
export function accountDevicePendingWithRedirectQuery(encodedRedirect?: string): string {
  if (!encodedRedirect) {
    return ACCOUNT_DEVICE_PENDING_PATH;
  }
  return `${ACCOUNT_DEVICE_PENDING_PATH}?redirect=${encodedRedirect}`;
}
