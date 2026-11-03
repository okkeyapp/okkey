import type { WebLocale } from "@okkey/i18n";

export type FormatUserLocalDateTimeOptions = {
  locale: WebLocale;
  /** Defaults to the viewer's IANA timezone from the runtime (e.g. Europe/Moscow). */
  timeZone?: string;
};

function webLocaleToIntlLocale(locale: WebLocale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}

export function resolveUserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Formats a UTC epoch timestamp for display in the viewer's local timezone. */
export function formatUserLocalDateParts(
  atMs: number,
  { locale, timeZone = resolveUserTimeZone() }: FormatUserLocalDateTimeOptions,
): { date: string; time: string } {
  const date = new Date(atMs);
  const intlLocale = webLocaleToIntlLocale(locale);

  return {
    date: new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(date),
    time: new Intl.DateTimeFormat(intlLocale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(date),
  };
}
