/**
 * Per-user Tips banner dismiss preference (local only — no DB migration).
 * Mirrors other device-local prefs such as system-update dismissals.
 */

const STORAGE_PREFIX = "okkey.tips.bannerDismissed.v1.u.";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function tipsBannerDismissedStorageKey(userId: string): string {
  return storageKey(userId);
}

export function readTipsBannerDismissed(userId: string | null | undefined): boolean {
  if (!userId) {
    return false;
  }
  const store = storage();
  if (!store) {
    return false;
  }
  try {
    return store.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeTipsBannerDismissed(userId: string, dismissed: boolean): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    if (dismissed) {
      store.setItem(storageKey(userId), "1");
    } else {
      store.removeItem(storageKey(userId));
    }
  } catch {
    // Ignore quota / private-mode failures; UI still updates in-memory.
  }
}
