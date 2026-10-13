/**
 * Per-user, per-workspace marker: personal_data bootstrap was dismissed by a
 * deliberate delete. Survives soft-delete retention purge so unlock does not
 * recreate the item / re-open the edit popup.
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
