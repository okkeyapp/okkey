import type { AvailableUpdateInfo, UpdateCheckInfo } from "./useUpdateCheck";

/** localStorage: dismissed available-update fingerprint (survives F5). */
export const UPDATE_DISMISS_STORAGE_KEY = "okkey.updates.dismissed";

/**
 * Stable fingerprint of the available set (id→to). Changing any target version
 * produces a new fingerprint so the notice returns.
 */
export function availableUpdatesFingerprint(
  available: readonly AvailableUpdateInfo[],
): string {
  return [...available]
    .map((u) => `${u.id}:${u.to}`)
    .sort()
    .join("|");
}

function localStorageOk(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined" &&
    typeof window.localStorage.getItem === "function" &&
    typeof window.localStorage.setItem === "function"
  );
}

export function readDismissedUpdatesFingerprint(): string | null {
  if (!localStorageOk()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(UPDATE_DISMISS_STORAGE_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function writeDismissedUpdatesFingerprint(fingerprint: string): void {
  if (!localStorageOk() || fingerprint.trim() === "") {
    return;
  }
  try {
    window.localStorage.setItem(UPDATE_DISMISS_STORAGE_KEY, fingerprint.trim());
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Persist dismiss for the current available set (Ignore until those `to` versions change). */
export function dismissAvailableUpdates(info: UpdateCheckInfo): void {
  if (info.available.length === 0) {
    return;
  }
  writeDismissedUpdatesFingerprint(availableUpdatesFingerprint(info.available));
}

/** True when notice should stay hidden for this available set. */
export function isUpdateNoticeDismissed(info: UpdateCheckInfo): boolean {
  if (info.available.length === 0) {
    return false;
  }
  const stored = readDismissedUpdatesFingerprint();
  if (!stored) {
    return false;
  }
  return stored === availableUpdatesFingerprint(info.available);
}
