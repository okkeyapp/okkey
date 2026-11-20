import { APP_LOCALES, FALLBACK_LOCALE, isAppLocale, type AppLocale } from "./locale-meta.js";
import { isWebLocale, type WebLocale } from "./web-format.js";

/**
 * Normalize a BCP 47 / POSIX tag: trim, `_` → `-`, lowercase language,
 * uppercase region when present (`pt_br` → `pt-BR`, `nl-be` → `nl-BE`).
 */
export function normalizeLocaleTag(tag: string): string {
  const raw = tag.trim().replace(/_/g, "-");
  if (!raw) return "";
  const parts = raw.split("-").filter(Boolean);
  if (parts.length === 0) return "";
  const language = (parts[0] ?? "").toLowerCase();
  if (parts.length === 1) return language;
  const region = (parts[1] ?? "").toUpperCase();
  const rest = parts.slice(2).map((p) => p.toLowerCase());
  return [language, region, ...rest].join("-");
}

function findShippedLocaleIgnoreCase(normalized: string): AppLocale | null {
  const lower = normalized.toLowerCase();
  for (const code of APP_LOCALES) {
    if (code.toLowerCase() === lower) {
      return code;
    }
  }
  return null;
}

/**
 * Map a browser language tag to a shipped AppLocale.
 *
 * Rules:
 * - Exact / case-insensitive match wins (`pt-BR`, `PT-br` → `pt-BR`).
 * - Region variants of a shipped primary locale map to that locale (`nl-BE` → `nl`,
 *   `de-AT` → `de`).
 * - Bare `pt` / `pt-PT` do **not** select `pt-BR` (Brazilian is region-specific).
 * - Unknown tags return null.
 */
export function matchAppLocaleTag(tag: string): AppLocale | null {
  const normalized = normalizeLocaleTag(tag);
  if (!normalized) return null;

  const exact = findShippedLocaleIgnoreCase(normalized);
  if (exact) return exact;

  const primary = normalized.toLowerCase().split("-")[0] ?? "";
  if (!primary) return null;

  // Region-specific shipped locales (e.g. pt-BR): never collapse bare `pt` / other
  // regions onto them. Only the exact match above selects them.
  if (primary === "pt") {
    return null;
  }

  if (isAppLocale(primary)) {
    return primary;
  }

  return null;
}

/**
 * First matching browser language, else fallback (English).
 */
export function detectAppLocaleFromLanguages(
  languages: readonly string[],
  fallback: AppLocale = FALLBACK_LOCALE,
): AppLocale {
  for (const tag of languages) {
    if (typeof tag !== "string" || tag.length === 0) continue;
    const match = matchAppLocaleTag(tag);
    if (match) return match;
  }
  return fallback;
}

export function matchWebLocaleTag(tag: string): WebLocale | null {
  const match = matchAppLocaleTag(tag);
  return match != null && isWebLocale(match) ? match : null;
}

export function detectWebLocaleFromLanguages(
  languages: readonly string[],
  fallback: WebLocale = FALLBACK_LOCALE as WebLocale,
): WebLocale {
  const detected = detectAppLocaleFromLanguages(languages, fallback);
  return isWebLocale(detected) ? detected : fallback;
}
