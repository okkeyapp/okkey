import { useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthVault } from "./AuthVaultContext";

/**
 * Redirect guests away from protected routes to email sign-in (before paint). /auth/* session flows are gated in App via GuestAuthOnly.
 */
export default function AuthSessionGate() {
  const { accessToken, emailChallengeId, pendingEmail, registrationAuthStateId, twoFactorAuthStateId } =
    useAuthVault();
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const isDevUi = import.meta.env.DEV && location.pathname === "/dev/ui";
    if (isDevUi) {
      return;
    }

    const path = location.pathname;

    if (accessToken) {
      return;
    }

    const inOtpFlow = Boolean(emailChallengeId && pendingEmail);
    const allowed =
      path === "/dev/ui" ||
      path === "/auth/email" ||
      (path === "/auth/otp" && inOtpFlow) ||
      (path === "/auth/registration" && Boolean(registrationAuthStateId)) ||
      (path === "/auth/two-factor" && Boolean(twoFactorAuthStateId)) ||
      path === "/unlock/password";

    if (!allowed) {
      navigate("/auth/email", { replace: true });
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
