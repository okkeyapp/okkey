import { ITEM_CATEGORY_LOGIN, type ItemPlaintextV2, type UrlAutofillScope } from "@okkey/types";

export type { UrlAutofillScope };

export function parseUrlAutofillScope(raw: unknown): UrlAutofillScope {
  if (raw === "exact-url" || raw === "none" || raw === "entire-site") {
    return raw;
  }
  return "entire-site";
}

export type ItemUrlMatchInput = {
  url: string;
  urlAutofillScope?: UrlAutofillScope | string | null;
};

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

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

/**
 * Match tab URL against an item URL field using autofill scope rules.
 * `exact-url` = origin + pathname (no query/hash) — plan §10 decision.
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
    return tab.origin === item.origin && normalizePathname(tab.pathname) === normalizePathname(item.pathname);
  }
  return normalizeHost(tab.hostname) === normalizeHost(item.hostname);
}

/**
 * Autofill helper: no tab constraint / empty URLs → treat as match (do not hide).
 * Prefer {@link itemHasUrlMatchingTab} / {@link itemUrlFieldsMatchTab} for strict matching.
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

/** True when the tab matches at least one URL field using that field's own `urlAutofillScope`. */
export function itemUrlFieldsMatchTab(
  tabUrl: string | null | undefined,
  fields: readonly ItemUrlMatchInput[],
): boolean {
  if (!tabUrl?.trim()) {
    return false;
  }
  return fields.some((field) => {
    const url = field.url.trim();
    if (!url) {
      return false;
    }
    return itemUrlMatchesTab(tabUrl, url, parseUrlAutofillScope(field.urlAutofillScope));
  });
}

export function collectItemUrlMatchInputs(item: ItemPlaintextV2): ItemUrlMatchInput[] {
  const out: ItemUrlMatchInput[] = [];
  for (const field of item.fields) {
    if (field.type !== "url" || field.value.kind !== "url") {
      continue;
    }
    const url = field.value.url.trim();
    if (!url) {
      continue;
    }
    out.push({
      url,
      urlAutofillScope: parseUrlAutofillScope(field.value.urlAutofillScope),
    });
  }
  return out;
}

/** Login/password items only: tab matches at least one «Вебсайт URL» by that field's scope. */
export function loginItemMatchesTab(
  item: ItemPlaintextV2,
  tabUrl: string | null | undefined,
): boolean {
  if (item.categoryId !== ITEM_CATEGORY_LOGIN || item.deleted) {
    return false;
  }
  return itemUrlFieldsMatchTab(tabUrl, collectItemUrlMatchInputs(item));
}
