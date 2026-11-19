import type { WebLocale } from "@okkey/i18n";

import { selfHostedPrivacyHtmlEn } from "./content/selfHosted.en";
import { selfHostedPrivacyHtmlRu } from "./content/selfHosted.ru";

/**
 * Self-hosted privacy HTML by locale. Missing locales fall back to English
 * so a new language can ship UI strings before legal copy is translated.
 */
const LEGAL_PRIVACY_HTML: Record<string, string> = {
  en: selfHostedPrivacyHtmlEn,
  ru: selfHostedPrivacyHtmlRu,
};

export function legalPrivacyHtmlForLocale(locale: WebLocale | string): string {
  return LEGAL_PRIVACY_HTML[locale] ?? LEGAL_PRIVACY_HTML.en;
}
