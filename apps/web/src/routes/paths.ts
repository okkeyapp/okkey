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

/** @deprecated Old URL; router redirects to {@link ACCOUNT_NEW_PATH} */
export const AUTH_REGISTRATION_LEGACY_PATH = "/auth/registration";

// --- Account (vault lock, registration, marketing restore) ---

export const ACCOUNT_LOCK_PATH = "/account/lock";
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
 * `/items` scope: at most one of `vault`, `folder`, or `search` in the URL.
 * The shell (`WorkspaceRoutesLayout`) normalizes conflicts (search clears vault/folder; vault clears folder).
 * Sidebar “active” rules treat “All items” as active only when none of these are set.
 */
export const VAULT_QUERY_PARAM = "vault";
export const FOLDER_QUERY_PARAM = "folder";
/** Selected item row on `/items` (master–detail); coexists with `workspace`, `vault`, or `folder`. */
export const ITEM_QUERY_PARAM = "item";

/** Non-default list filter on `/items` (`all` omits this param). */
export const FILTER_QUERY_PARAM = "filter";
export const FILTER_QUERY_FAVOURITES = "favourites";
export const FILTER_QUERY_ARCHIVED = "archived";
export const FILTER_QUERY_DELETED = "deleted";

/** Non-default sort on `/items` (default `date-desc` omits this param). */
export const SORT_QUERY_PARAM = "sort";
export const SORT_QUERY_DATE_DESC = "date-desc";
export const SORT_QUERY_DATE_ASC = "date-asc";
export const SORT_QUERY_ALPH_ASC = "alph-asc";
export const SORT_QUERY_ALPH_DESC = "alph-desc";

/** Full-text-ish search on `/items` (top bar); coexists with other `?` params. */
export const SEARCH_QUERY_PARAM = "search";

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
      n.delete(FOLDER_QUERY_PARAM);
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
      n.delete(SEARCH_QUERY_PARAM);
      n.delete(FILTER_QUERY_PARAM);
    },
    options,
  );
}

/** Sidebar “All items”: drop vault, folder, search, and list filter; keep `item` and `sort`. */
export function itemsPathAllWorkspaceMerged(current: URLSearchParams, options?: MergeItemsLocationOptions): string {
  return mergeItemsLocationSearch(
    current,
    (n) => {
      n.delete(VAULT_QUERY_PARAM);
      n.delete(FOLDER_QUERY_PARAM);
      n.delete(SEARCH_QUERY_PARAM);
      n.delete(FILTER_QUERY_PARAM);
    },
    options,
  );
}

export const CAPSULES_PATH = "/capsules";
export const MONITORING_PATH = "/monitoring";
export const TOOLS_PATH = "/tools";
export const SETTINGS_PATH = "/settings";

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
  return (WORKSPACE_APP_SHELL_PATHS as readonly string[]).includes(pathname);
}

/**
 * Master-password lock screen with redirect query (value must already be encoded for query safety).
 * @example accountLockWithRedirectQuery(encodeURIComponent(`${WORKSPACES_PATH}/ws-1`))
 */
export function accountLockWithRedirectQuery(encodedRedirect: string): string {
  return `${ACCOUNT_LOCK_PATH}?redirect=${encodedRedirect}`;
}
