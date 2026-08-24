import {
  ACCOUNT_LOCK_PATH,
  ACCOUNT_NEW_PATH,
  ACCOUNT_RESTORE_PATH,
  AUTH_EMAIL_PATH,
  AUTH_OTP_PATH,
  AUTH_REGISTRATION_LEGACY_PATH,
  AUTH_TWO_FACTOR_PATH,
  isCapsulePublicPathname,
  isDevUiPathname,
  isInvitePathname,
  UNLOCK_PASSWORD_LEGACY_PATH,
} from "./paths";

export type GuestEntryPathContext = {
  inOtpFlow: boolean;
  hasRegistrationAuthState: boolean;
  hasTwoFactorAuthState: boolean;
};

/**
 * Routes that may render **without** a Bearer session (see AuthSessionGate).
 * Must stay in sync with `GuestAuthOnly` / public account routes in AppRoutes.
 */
export function isAllowedPathWithoutBearerSession(pathname: string, ctx: GuestEntryPathContext): boolean {
  if (isDevUiPathname(pathname)) {
    return true;
  }
  if (isCapsulePublicPathname(pathname)) {
    return true;
  }
  if (pathname === AUTH_EMAIL_PATH) {
    return true;
  }
  if (pathname === AUTH_OTP_PATH && ctx.inOtpFlow) {
    return true;
  }
  if ((pathname === ACCOUNT_NEW_PATH || pathname === AUTH_REGISTRATION_LEGACY_PATH) && ctx.hasRegistrationAuthState) {
    return true;
  }
  if (pathname === AUTH_TWO_FACTOR_PATH && ctx.hasTwoFactorAuthState) {
    return true;
  }
  if (pathname === ACCOUNT_LOCK_PATH || pathname === UNLOCK_PASSWORD_LEGACY_PATH) {
    return true;
  }
  if (pathname === ACCOUNT_RESTORE_PATH) {
    return true;
  }
  if (isInvitePathname(pathname)) {
    return true;
  }
  return false;
}
