import { useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { isAllowedPathWithoutBearerSession } from "../routes/guestEntryPaths";
import { AUTH_EMAIL_PATH, isDevUiPathname } from "../routes/paths";
import { useAuthVault } from "./AuthVaultContext";

/**
 * Redirect guests away from protected routes to email sign-in (before paint).
 * Public entry routes are listed in {@link isAllowedPathWithoutBearerSession} and mirrored in AppRoutes.
 */
export default function AuthSessionGate() {
  const { accessToken, emailChallengeId, pendingEmail, registrationAuthStateId, twoFactorAuthStateId } =
    useAuthVault();
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (import.meta.env.DEV && isDevUiPathname(location.pathname)) {
      return;
    }

    const path = location.pathname;

    if (accessToken) {
      return;
    }

    const inOtpFlow = Boolean(emailChallengeId && pendingEmail);
    const allowed = isAllowedPathWithoutBearerSession(path, {
      inOtpFlow,
      hasRegistrationAuthState: Boolean(registrationAuthStateId),
      hasTwoFactorAuthState: Boolean(twoFactorAuthStateId),
    });

    if (!allowed) {
      navigate(AUTH_EMAIL_PATH, { replace: true });
    }
  }, [
    accessToken,
    location.pathname,
    navigate,
    emailChallengeId,
    pendingEmail,
    registrationAuthStateId,
    twoFactorAuthStateId,
  ]);

  return null;
}
