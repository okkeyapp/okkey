/**
 * Browser-local cache of the server personal_data bootstrap dismissed flag.
 * Authoritative value lives on the server (workspace member item-category
 * preferences). This cache only speeds same-browser skips; new profiles /
 * cleared site data must read the server flag.
 */

const PREFIX = "okkey.personalDataBootstrap.dismissed.u.";

export function personalDataBootstrapDismissedStorageKey(
  userId: string,
  workspaceId: string,
): string {
  return `${PREFIX}${userId}.w.${workspaceId}`;
}

function localStorageOk(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    typeof localStorage.getItem === "function" &&
    typeof localStorage.setItem === "function"
  );
}

export function isPersonalDataBootstrapDismissed(
  userId: string | null | undefined,
  workspaceId: string | null | undefined,
): boolean {
  if (!userId || !workspaceId || !localStorageOk()) {
    return false;
  }
  try {
    return localStorage.getItem(personalDataBootstrapDismissedStorageKey(userId, workspaceId)) === "1";
  } catch {
    return false;
  }
}

export function markPersonalDataBootstrapDismissed(
  userId: string | null | undefined,
  workspaceId: string | null | undefined,
): void {
  if (!userId || !workspaceId || !localStorageOk()) {
    return;
  }
  try {
    localStorage.setItem(personalDataBootstrapDismissedStorageKey(userId, workspaceId), "1");
  } catch {
    /* quota / private mode */
  }
}
