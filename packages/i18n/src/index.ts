export type { AppLocale, LocaleDir, LocaleMeta, YearMonthOrder } from "./locale-meta.js";
export {
  APP_LOCALES,
  FALLBACK_LOCALE,
  LOCALE_DEFAULTS,
  LOCALE_META,
  LOCALE_READINESS_THRESHOLD_PERCENT,
  READY_LOCALES,
  dateFnsLocaleId,
  docsPathPrefix,
  getLocaleMeta,
  intlLocaleTag,
  isAppLocale,
  isReadyLocale,
  localeTextDirection,
  yearMonthOrder,
} from "./locale-meta.js";

export type { EmailLocale } from "./email-locale.js";
export { EMAIL_LOCALES, emailBundles, isEmailLocale } from "./email-locale.js";
export { formatEmailMessage, type EmailMessageValues } from "./email-format.js";
export {
  buildLicenseRequestEmailCopy,
  type LicenseRequestEmailCopy,
  type LicenseRequestEmailFields,
} from "./license-request-email.js";
export type { WebLocale, WebMessageValues } from "./web-format.js";
export {
  formatWebMessage,
  getWebMessagePattern,
  getWebLocaleNativeName,
  isWebLocale,
  READY_WEB_LOCALES,
  WEB_LOCALES,
  webBundles,
} from "./web-format.js";
