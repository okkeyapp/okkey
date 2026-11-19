import {
  APP_LOCALES,
  FALLBACK_LOCALE,
  LOCALE_DEFAULTS,
  LOCALE_META,
  LOCALE_READINESS_THRESHOLD_PERCENT,
  READY_LOCALES,
  type AppLocale,
  type LocaleDir,
  type LocaleMeta,
  type YearMonthOrder,
} from "./locale-registry.gen.js";

export type { AppLocale, LocaleDir, LocaleMeta, YearMonthOrder };
export {
  APP_LOCALES,
  FALLBACK_LOCALE,
  LOCALE_DEFAULTS,
  LOCALE_META,
  LOCALE_READINESS_THRESHOLD_PERCENT,
  READY_LOCALES,
};

export function isAppLocale(value: string): value is AppLocale {
  return Object.prototype.hasOwnProperty.call(LOCALE_META, value);
}

/** BCP-47 tag for `Intl.*` and ICU MessageFormat. Unknown → fallback. */
export function intlLocaleTag(locale: string): string {
  if (isAppLocale(locale)) {
    return LOCALE_META[locale].intl;
  }
  return LOCALE_META[FALLBACK_LOCALE].intl;
}

/** `ltr` / `rtl` for `<html dir>`. Unknown → fallback. */
export function localeTextDirection(locale: string): LocaleDir {
  if (isAppLocale(locale)) {
    return LOCALE_META[locale].dir;
  }
  return LOCALE_META[FALLBACK_LOCALE].dir;
}

/** date-fns locale module id (`enUS`, `ru`, …). Unknown → fallback. */
export function dateFnsLocaleId(locale: string): string {
  if (isAppLocale(locale)) {
    return LOCALE_META[locale].dateFns;
  }
  return LOCALE_META[FALLBACK_LOCALE].dateFns;
}

/**
 * Public docs path prefix (RU unprefixed `""`, EN `"/en"`).
 * Unknown locales fall back to English docs.
 */
export function docsPathPrefix(locale: string): string {
  if (isAppLocale(locale)) {
    return LOCALE_META[locale].docsPathPrefix;
  }
  return LOCALE_META[FALLBACK_LOCALE].docsPathPrefix;
}

export function yearMonthOrder(locale: string): YearMonthOrder {
  if (isAppLocale(locale)) {
    return LOCALE_META[locale].yearMonthOrder;
  }
  return LOCALE_META[FALLBACK_LOCALE].yearMonthOrder;
}

export function isReadyLocale(locale: string): locale is AppLocale {
  return isAppLocale(locale) && READY_LOCALES.includes(locale);
}

export function getLocaleMeta(locale: AppLocale): LocaleMeta {
  return LOCALE_META[locale];
}
