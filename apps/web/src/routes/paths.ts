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

/** Use in `<Route path={...} />` only */
export const WORKSPACE_DETAIL_ROUTE_PARAM = "workspaceId";
export const WORKSPACE_DETAIL_PATH_PATTERN = `${WORKSPACES_PATH}/:${WORKSPACE_DETAIL_ROUTE_PARAM}` as const;

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
  | "alert";

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

/** `/workspaces/:id` */
export function workspacePath(workspaceId: string): string {
  return `${WORKSPACES_PATH}/${encodeURIComponent(workspaceId)}`;
}

/**
 * Master-password lock screen with redirect query (value must already be encoded for query safety).
 * @example accountLockWithRedirectQuery(encodeURIComponent(`${WORKSPACES_PATH}/ws-1`))
 */
export function accountLockWithRedirectQuery(encodedRedirect: string): string {
  return `${ACCOUNT_LOCK_PATH}?redirect=${encodedRedirect}`;
}
