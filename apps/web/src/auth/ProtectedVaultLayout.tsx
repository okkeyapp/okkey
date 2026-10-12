import { Spinner } from "@okkey/ui";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import {
  accountDevicePendingWithRedirectQuery,
  accountLockWithRedirectQuery,
  AUTH_EMAIL_PATH,
} from "../routes/paths";
import { useAuthVault } from "./AuthVaultContext";
import { hasExtensionAuthPending } from "./extensionAuthPendingStorage";

/**
 * Child routes require a Bearer session, a trusted device, and an unlocked vault.
 * Otherwise redirect to device-pending or unlock with the target URL preserved.
 * Extension PKCE handoff short-circuits: no unlock / vault UI while pending.
 */
export default function ProtectedVaultLayout() {
  const {
    accessToken,
    vaultUnlocked,
    vaultUnlockBootstrapLoading,
    deviceTrustStatus,
  } = useAuthVault();
  const location = useLocation();

  if (!accessToken) {
    return (
      <Navigate
        to={AUTH_EMAIL_PATH}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (hasExtensionAuthPending()) {
    return (
      <div
        className="flex min-h-dvh min-h-screen w-full items-center justify-center okkey-body text-copy-secondary"
        role="status"
        aria-busy="true"
      >
        <Spinner />
      </div>
    );
  }

  if (
    deviceTrustStatus === "checking" ||
    deviceTrustStatus === "idle" ||
    vaultUnlockBootstrapLoading
  ) {
    return (
      <div
        className="flex min-h-dvh min-h-screen w-full items-center justify-center okkey-body text-copy-secondary"
        role="status"
        aria-busy="true"
      >
        <Spinner />
      </div>
    );
  }

  if (
    deviceTrustStatus === "pending" ||
    deviceTrustStatus === "blocked" ||
    deviceTrustStatus === "rejected" ||
    deviceTrustStatus === "error"
  ) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={accountDevicePendingWithRedirectQuery(redirect)} replace />;
  }

  if (!vaultUnlocked) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={accountLockWithRedirectQuery(redirect)} replace />;
  }

  return <Outlet />;
}
