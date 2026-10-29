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

/** Drop `lng` from a query string (preserves other params). */
export function stripLocaleFromUrlSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  if (!params.has(LOCALE_QUERY_PARAM)) {
    return search.startsWith("?") || search.length === 0 ? search : `?${search}`;
  }
  params.delete(LOCALE_QUERY_PARAM);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * If the URL has a supported `lng`, persist it, apply once, then remove `lng`
 * via `history.replaceState` so reload does not keep overriding the UI locale.
 */
export function applyLocaleFromUrlAndStrip(): WebLocale | null {
  if (typeof window === "undefined") {
    return null;
  }
  const fromUrl = readLocaleFromSearch(window.location.search);
  if (!fromUrl) {
    return null;
  }
  writeStoredLocale(fromUrl);
  const nextSearch = stripLocaleFromUrlSearch(window.location.search);
  if (nextSearch !== window.location.search) {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${nextSearch}${window.location.hash}`,
    );
  }
  return fromUrl;
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
