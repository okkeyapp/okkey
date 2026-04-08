import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuthVault } from "../auth/AuthVaultContext";

export default function Home() {
  const { accessToken, vaultUnlocked } = useAuthVault();
  const navigate = useNavigate();

  useEffect(() => {
    if (accessToken && vaultUnlocked) {
      navigate("/workspaces", { replace: true });
    }
  }, [accessToken, vaultUnlocked, navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Okkey</h1>
        <p className="mt-2 text-muted-foreground">Web client (development scaffold)</p>
        {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_LINKS === "true") && (
          <p className="mt-4 text-sm">
            <Link to="/dev/ui" className="text-primary font-medium hover:underline">
              Design system gallery (/dev/ui)
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
