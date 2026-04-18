import { Navigate, Outlet, useLocation } from "react-router-dom";

import { accountLockWithRedirectQuery, AUTH_EMAIL_PATH } from "../routes/paths";
import { useAuthVault } from "./AuthVaultContext";

/**
 * Child routes require a Bearer session and an unlocked vault.
 * Otherwise redirect to unlock with the target URL preserved (no flash via /workspaces).
 */
export default function ProtectedVaultLayout() {
  const { accessToken, vaultUnlocked, vaultUnlockBootstrapLoading } = useAuthVault();
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to={AUTH_EMAIL_PATH} replace state={{ from: location.pathname + location.search }} />;
  }

  if (vaultUnlockBootstrapLoading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center okkey-body text-copy-secondary">
        …
      </div>
    );
  }

  if (!vaultUnlocked) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={accountLockWithRedirectQuery(redirect)} replace />;
  }

  return <Outlet />;
}
