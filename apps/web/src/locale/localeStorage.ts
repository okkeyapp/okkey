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
 * Absolute href with `lng` removed. Returns null when `lng` is absent.
 * Always returns a same-origin absolute URL so `history.replaceState` stays
 * safe even when `pathname` starts with `//` (protocol-relative trap).
 */
export function hrefWithoutLocaleQuery(href: string): string | null {
  try {
    const url = new URL(href);
    if (!url.searchParams.has(LOCALE_QUERY_PARAM)) {
      return null;
    }
    url.searchParams.delete(LOCALE_QUERY_PARAM);
    return url.href;
  } catch {
    return null;
  }
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
  const nextHref = hrefWithoutLocaleQuery(window.location.href);
  if (nextHref && nextHref !== window.location.href) {
    try {
      window.history.replaceState(window.history.state, "", nextHref);
    } catch {
      /* SecurityError / odd history hosts — locale already persisted */
    }
  }
  return fromUrl;
}

/** Supported locale stored by an explicit choice (`okkey.locale` or a `lng` link). */
export function readExplicitStoredLocale(): WebLocale | null {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw != null && isWebLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Map a BCP 47 tag to a supported UI locale by primary subtag (`ru-RU` → `ru`).
 * Returns null when the language is not shipped.
 */
export function matchLocalePrimarySubtag(tag: string): WebLocale | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return primary.length > 0 && isWebLocale(primary) ? primary : null;
}

/**
 * First supported language in `languages`, otherwise English.
 * Does not write storage.
 */
export function detectLocaleFromLanguages(languages: readonly string[]): WebLocale {
  for (const tag of languages) {
    if (typeof tag !== "string" || tag.length === 0) continue;
    const match = matchLocalePrimarySubtag(tag);
    if (match) return match;
  }
  return "en";
}

/**
 * Explicit stored locale wins. Otherwise the first supported browser language.
 * The detected value is not persisted.
 */
export function resolveInitialWebLocale(input: {
  stored: string | null | undefined;
  languages: readonly string[];
}): WebLocale {
  if (input.stored != null && isWebLocale(input.stored)) return input.stored;
  return detectLocaleFromLanguages(input.languages);
}

function browserLanguageTags(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  const list = navigator.languages;
  if (list != null && list.length > 0) return list;
  const single = navigator.language;
  return single ? [single] : [];
}

/**
 * Locale for the current document: stored choice, else browser, else English.
 * Does not persist a browser-detected value.
 */
export function readStoredLocale(): WebLocale {
  return resolveInitialWebLocale({
    stored: readExplicitStoredLocale(),
    languages: browserLanguageTags(),
  });
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
