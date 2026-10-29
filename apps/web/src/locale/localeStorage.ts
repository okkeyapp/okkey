import { isWebLocale, type WebLocale } from "@okkey/i18n";

export const LOCALE_STORAGE_KEY = "okkey.locale";
/** Query param used by email deep-links (`buildEmailAppPathUrl` / `lng`). */
export const LOCALE_QUERY_PARAM = "lng";

export function readLocaleFromSearch(search: string): WebLocale | null {
  try {
    const raw = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get(
      LOCALE_QUERY_PARAM,
    );
    if (raw != null && isWebLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function readStoredLocale(): WebLocale {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw != null && isWebLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "en";
}

export function writeStoredLocale(locale: WebLocale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function applyLocaleToDocument(locale: WebLocale): void {
  document.documentElement.lang = locale === "ru" ? "ru" : "en";
}

export type { WebLocale };
