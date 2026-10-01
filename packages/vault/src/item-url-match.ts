export type UrlAutofillScope = "entire-site" | "exact-url" | "none";

function tryParseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

/**
 * Match tab URL against an item URL field using autofill scope rules.
 * `exact-url` = origin + pathname (no query/hash) — plan §10 decision.
 * Until scope is persisted in plaintext (E4), callers should default to `entire-site`.
 */
export function itemUrlMatchesTab(
  tabUrl: string,
  itemUrl: string,
  scope: UrlAutofillScope = "entire-site",
): boolean {
  if (scope === "none") {
    return false;
  }
  const tab = tryParseUrl(tabUrl);
  const item = tryParseUrl(itemUrl);
  if (!tab || !item) {
    return false;
  }
  if (scope === "exact-url") {
    return tab.origin === item.origin && tab.pathname === item.pathname;
  }
  // entire-site: host match (ignore www.)
  const normalizeHost = (host: string) => host.replace(/^www\./i, "").toLowerCase();
  return normalizeHost(tab.hostname) === normalizeHost(item.hostname);
}

/**
 * Autofill helper: no tab constraint / empty URLs → treat as match (do not hide).
 * Prefer {@link itemHasUrlMatchingTab} when filtering to tab-matching suggestions.
 */
export function itemUrlsMatchTab(
  tabUrl: string | null | undefined,
  itemUrls: readonly string[],
  scope: UrlAutofillScope = "entire-site",
): boolean {
  if (!tabUrl?.trim() || itemUrls.length === 0) {
    return true;
  }
  return itemUrls.some((url) => itemUrlMatchesTab(tabUrl, url, scope));
}

/** True only when the tab URL matches at least one item URL (strict; empty → false). */
export function itemHasUrlMatchingTab(
  tabUrl: string | null | undefined,
  itemUrls: readonly string[],
  scope: UrlAutofillScope = "entire-site",
): boolean {
  if (!tabUrl?.trim() || itemUrls.length === 0) {
    return false;
  }
  return itemUrls.some((url) => itemUrlMatchesTab(tabUrl, url, scope));
}
