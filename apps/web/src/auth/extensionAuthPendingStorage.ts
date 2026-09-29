/**
 * Pending browser-extension PKCE handoff (session only — no vault unlock).
 * Stored in sessionStorage so a mid-login tab can finish after email/2FA/passkey.
 */

export const EXTENSION_AUTH_PENDING_KEY = "okkey.extension.auth.pending";

export type ExtensionAuthPending = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  createdAt: number;
};

const MAX_AGE_MS = 15 * 60 * 1000;

function sessionStorageOk(): boolean {
  return (
    typeof sessionStorage !== "undefined" &&
    typeof sessionStorage.getItem === "function" &&
    typeof sessionStorage.setItem === "function" &&
    typeof sessionStorage.removeItem === "function"
  );
}

export function readExtensionAuthPending(): ExtensionAuthPending | null {
  if (!sessionStorageOk()) {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(EXTENSION_AUTH_PENDING_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ExtensionAuthPending;
    if (
      !parsed.clientId?.trim() ||
      !parsed.redirectUri?.trim() ||
      !parsed.state?.trim() ||
      !parsed.codeChallenge?.trim()
    ) {
      return null;
    }
    if (!Number.isFinite(parsed.createdAt) || Date.now() - parsed.createdAt > MAX_AGE_MS) {
      clearExtensionAuthPending();
      return null;
    }
    return {
      clientId: parsed.clientId.trim(),
      redirectUri: parsed.redirectUri.trim(),
      state: parsed.state.trim(),
      codeChallenge: parsed.codeChallenge.trim(),
      codeChallengeMethod: "S256",
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function writeExtensionAuthPending(pending: Omit<ExtensionAuthPending, "createdAt">): void {
  if (!sessionStorageOk()) {
    return;
  }
  const value: ExtensionAuthPending = {
    ...pending,
    codeChallengeMethod: "S256",
    createdAt: Date.now(),
  };
  try {
    sessionStorage.setItem(EXTENSION_AUTH_PENDING_KEY, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function clearExtensionAuthPending(): void {
  if (!sessionStorageOk()) {
    return;
  }
  sessionStorage.removeItem(EXTENSION_AUTH_PENDING_KEY);
}

/** Sync check for gate / GuestAuthOnly (no expiry side effects beyond read). */
export function hasExtensionAuthPending(): boolean {
  return readExtensionAuthPending() != null;
}
