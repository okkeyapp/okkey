import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthVault } from "./AuthVaultContext";

/**
 * Дочерние маршруты доступны только при Bearer-сессии и разблокированном vault.
 * Иначе — редирект на unlock с сохранением целевого URL (без «мигания» через /workspaces).
 */
export default function ProtectedVaultLayout() {
  const { accessToken, vaultUnlocked, vaultUnlockBootstrapLoading } = useAuthVault();
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/auth/email" replace state={{ from: location.pathname + location.search }} />;
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
    return <Navigate to={`/unlock/password?redirect=${redirect}`} replace />;
  }

  return <Outlet />;
}
