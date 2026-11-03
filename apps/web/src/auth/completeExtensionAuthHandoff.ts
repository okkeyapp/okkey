import { createBearerApiClient } from "@okkey/api";
import { AuthClient } from "@okkey/auth";

import { getApiBaseUrl } from "../api/client";
import {
  clearExtensionAuthPending,
  readExtensionAuthPending,
  type ExtensionAuthPending,
} from "./extensionAuthPendingStorage";
import { readStoredSession } from "./sessionAuthStorage";

/**
 * If an extension PKCE handoff is pending and a Bearer session exists, mint
 * auth_code and redirect the tab to the extension callback. Returns true when
 * handoff was attempted (caller should not navigate into vault UI). Vault unlock
 * on web is never required.
 */
export async function completeExtensionAuthHandoffIfPending(): Promise<boolean> {
  const pending = readExtensionAuthPending();
  if (!pending) {
    return false;
  }
  const session = readStoredSession();
  if (!session?.access_token) {
    return false;
  }
  const authClient = new AuthClient(
    createBearerApiClient(getApiBaseUrl(), session.access_token),
  );
  try {
    const issued = await authClient.issueExtensionAuthCode({
      client_id: pending.clientId,
      redirect_uri: pending.redirectUri,
      code_challenge: pending.codeChallenge,
      code_challenge_method: "S256",
    });
    clearExtensionAuthPending();
    redirectToExtensionCallback(pending, issued.code);
    return true;
  } catch (error: unknown) {
    // Keep pending so the start page / retry can surface the error.
    console.error("[okkey] extension auth handoff failed", error);
    return false;
  }
}

export function redirectToExtensionCallback(pending: ExtensionAuthPending, code: string): void {
  const target = new URL(pending.redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", pending.state);
  window.location.assign(target.toString());
}
