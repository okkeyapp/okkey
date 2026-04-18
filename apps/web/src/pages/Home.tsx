import { Link, Navigate } from "react-router-dom";

import { useAuthVault } from "../auth/AuthVaultContext";
import { DEFAULT_AUTHENTICATED_PATH, DEV_UI_BASE_PATH } from "../routes/paths";

export default function Home() {
  const { accessToken } = useAuthVault();

  if (accessToken) {
    return <Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Okkey</h1>
        <p className="mt-2 text-muted-foreground">Web client (development scaffold)</p>
        {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_LINKS === "true") && (
          <p className="mt-4 text-sm">
            <Link to={DEV_UI_BASE_PATH} className="text-primary font-medium hover:underline">
              Design system gallery ({DEV_UI_BASE_PATH})
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
