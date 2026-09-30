export type UrlAutofillScope = "entire-site" | "exact-url" | "none";

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
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
