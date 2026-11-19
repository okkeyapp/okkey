import { IntlMessageFormat } from "intl-messageformat";

import { emailBundles, type EmailLocale } from "./email-bundles.gen.js";
import { FALLBACK_LOCALE, intlLocaleTag } from "./locale-meta.js";

export type { EmailLocale };

function loadBundle(locale: EmailLocale): Record<string, string> {
  return emailBundles[locale] as Record<string, string>;
}

export type EmailMessageValues = Record<
  string,
  string | number | boolean | Date | null | undefined
>;

/**
 * Format a namespaced email string (ICU MessageFormat). Falls back to English if key missing in locale.
 */
export function formatEmailMessage(
  locale: EmailLocale,
  messageKey: string,
  values: EmailMessageValues,
): string {
  const primary = loadBundle(locale)[messageKey];
  const pattern = primary ?? loadBundle(FALLBACK_LOCALE as EmailLocale)[messageKey];
  if (pattern === undefined) {
    throw new Error(`Missing email i18n key: ${messageKey}`);
  }
  return new IntlMessageFormat(pattern, intlLocaleTag(locale)).format(values) as string;
}
