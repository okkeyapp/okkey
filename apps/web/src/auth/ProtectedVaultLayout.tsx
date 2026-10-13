import { Spinner } from "@okkey/ui";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { createAuthenticatedCoreClient } from "../api/client";
import {
  accountDevicePendingWithRedirectQuery,
  accountLockWithRedirectQuery,
  AUTH_EMAIL_PATH,
} from "../routes/paths";
import { useAuthVault } from "./AuthVaultContext";
import { hasExtensionAuthPending } from "./extensionAuthPendingStorage";
import RecoveryKeyRequiredScreen from "./RecoveryKeyRequiredScreen";
import { recoveryKeyGatePhase, type RecoveryKeyGatePhase } from "./recoveryKeyGate";

function useRecoveryKeyGate(active: boolean, accessToken: string | null) {
  const [phase, setPhase] = useState<RecoveryKeyGatePhase>("loading");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!active || !accessToken) {
      setPhase("loading");
      return;
    }
    let cancelled = false;
    setPhase("loading");
    void createAuthenticatedCoreClient(accessToken)
      .getAccountRecoveryStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }
        setPhase(recoveryKeyGatePhase({ status, loaded: true, failed: false }));
      })
      .catch(() => {
        if (!cancelled) {
          setPhase(recoveryKeyGatePhase({ status: null, loaded: true, failed: true }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, accessToken, reloadToken]);

  return {
    phase,
    retry: () => setReloadToken((value) => value + 1),
    markReady: () => setPhase("ready"),
  };
}

/**
 * Child routes require a Bearer session, a trusted device, an unlocked vault,
 * and a saved recovery key. Otherwise redirect to device-pending or unlock,
 * or show the recovery key step.
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
  const recoveryGateActive =
    Boolean(accessToken) && vaultUnlocked && deviceTrustStatus === "trusted";
  const recoveryGate = useRecoveryKeyGate(recoveryGateActive, accessToken);

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

  if (recoveryGate.phase === "loading") {
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

  if (recoveryGate.phase === "required" || recoveryGate.phase === "unavailable") {
    return (
      <RecoveryKeyRequiredScreen
        phase={recoveryGate.phase}
        onRetryStatus={recoveryGate.retry}
        onEnrolled={recoveryGate.markReady}
      />
    );
  }

  return <Outlet />;
}
