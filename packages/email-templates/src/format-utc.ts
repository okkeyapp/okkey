import type { EmailLocale } from "@okkey/i18n";

/**
 * Locale-aware UTC timestamp for all email templates.
 * Always includes an explicit `UTC` zone label (device, 2FA, recovery, etc.).
 */
export function formatUtcWhen(locale: EmailLocale, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const formatted = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(d);
  return `${formatted} UTC`;
}
