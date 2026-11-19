import { IntlMessageFormat } from "intl-messageformat";

import { FALLBACK_LOCALE, intlLocaleTag, READY_LOCALES } from "./locale-meta.js";
import { webBundles, type WebLocale, WEB_LOCALES } from "./web-bundles.gen.js";

export type { WebLocale };
export { webBundles, WEB_LOCALES };

/** Locales offered in language switchers (ready + coverage threshold). */
export { READY_LOCALES as READY_WEB_LOCALES };

export type WebMessageValues = Record<
  string,
  string | number | boolean | Date | null | undefined
>;

/**
 * Raw ICU pattern for a web UI key (no variable substitution). Use with runtime values via {@link formatWebMessage}.
 */
export function getWebMessagePattern(locale: WebLocale, messageKey: string): string {
  const bundle = webBundles[locale] as Record<string, string>;
  const primary = bundle[messageKey];
  const pattern =
    primary ?? (webBundles[FALLBACK_LOCALE as WebLocale] as Record<string, string>)[messageKey];
  if (pattern === undefined) {
    throw new Error(`Missing web i18n key: ${messageKey}`);
  }
  return pattern;
}

/**
 * Format a web UI string (ICU MessageFormat). Falls back to English if the key is missing in the locale.
 */
export function formatWebMessage(
  locale: WebLocale,
  messageKey: string,
  values: WebMessageValues = {},
): string {
  const bundle = webBundles[locale] as Record<string, string>;
  const primary = bundle[messageKey];
  const pattern =
    primary ?? (webBundles[FALLBACK_LOCALE as WebLocale] as Record<string, string>)[messageKey];
  if (pattern === undefined) {
    throw new Error(`Missing web i18n key: ${messageKey}`);
  }
  return new IntlMessageFormat(pattern, intlLocaleTag(locale)).format(values) as string;
}

/** Label for the locale picker (each bundle defines its own `web.locale.nativeName`). */
export function getWebLocaleNativeName(locale: WebLocale): string {
  const name = (webBundles[locale] as Record<string, string>)["web.locale.nativeName"];
  return name ?? locale;
}

export function isWebLocale(value: string): value is WebLocale {
  return Object.prototype.hasOwnProperty.call(webBundles, value);
}
