import { IntlMessageFormat } from "intl-messageformat";
import type { EmailLocale } from "./email-locale.js";
import en from "./locales/email/en.json" with { type: "json" };
import ru from "./locales/email/ru.json" with { type: "json" };

const bundles: Record<EmailLocale, Record<string, string>> = {
  en: en as Record<string, string>,
  ru: ru as Record<string, string>,
};

function loadBundle(locale: EmailLocale): Record<string, string> {
  return bundles[locale];
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
  const pattern = primary ?? loadBundle("en")[messageKey];
  if (pattern === undefined) {
    throw new Error(`Missing email i18n key: ${messageKey}`);
  }
  const loc = locale === "ru" ? "ru" : "en";
  return new IntlMessageFormat(pattern, loc).format(values) as string;
}
