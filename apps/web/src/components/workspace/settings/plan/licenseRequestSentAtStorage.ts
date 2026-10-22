const SENT_AT_STORAGE_PREFIX = "okkey.licenseRequest.sentAt:";

/** Client-side sent_at for logger/mailto path (API does not persist when not deliverable). */
export function readLicenseRequestSentAt(workspaceId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`${SENT_AT_STORAGE_PREFIX}${workspaceId}`);
    if (!raw) {
      return null;
    }
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) {
      return null;
    }
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

export function writeLicenseRequestSentAt(workspaceId: string, iso: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(`${SENT_AT_STORAGE_PREFIX}${workspaceId}`, iso);
  } catch {
    /* quota / private mode — ignore */
  }
}

export function formatLicenseRequestSentAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  // e.g. RU `22.10.2026, 16:13` / EN-GB `22/10/2026, 16:13`
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
