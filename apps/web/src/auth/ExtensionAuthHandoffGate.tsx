import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import {
  ACCOUNT_NEW_PATH,
  AUTH_EXTENSION_START_PATH,
  AUTH_REGISTRATION_LEGACY_PATH,
} from "../routes/paths";
import { completeExtensionAuthHandoffIfPending } from "./completeExtensionAuthHandoff";
import { hasExtensionAuthPending } from "./extensionAuthPendingStorage";
import { readStoredSession } from "./sessionAuthStorage";
import { useAuthVault } from "./AuthVaultContext";

/**
 * Paths that own their own post-session UX (start page handoff, registration recovery).
 * Everywhere else with pending + Bearer must leave web immediately.
 */
function shouldSkipHandoffGate(pathname: string): boolean {
  return (
    pathname === AUTH_EXTENSION_START_PATH ||
    pathname === ACCOUNT_NEW_PATH ||
    pathname === AUTH_REGISTRATION_LEGACY_PATH
  );
}

/**
 * When an extension PKCE handoff is pending and a Bearer session exists,
 * mint auth_code and redirect to the extension callback — never unlock vault
 * or continue to workspaces in this tab.
 */
export default function ExtensionAuthHandoffGate() {
  const { accessToken } = useAuthVault();
  const location = useLocation();
  const inFlightRef = useRef(false);

  useLayoutEffect(() => {
    if (shouldSkipHandoffGate(location.pathname)) {
      return;
    }
    const hasSession = Boolean(accessToken ?? readStoredSession()?.access_token);
    if (!hasSession || !hasExtensionAuthPending()) {
      return;
    }
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    void completeExtensionAuthHandoffIfPending().finally(() => {
      inFlightRef.current = false;
    });
  }, [accessToken, location.pathname]);

  return null;
}
