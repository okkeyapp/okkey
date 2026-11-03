export type { EmailLocale } from "./email-locale.js";
export { EMAIL_LOCALES, isEmailLocale } from "./email-locale.js";
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
  WEB_LOCALES,
  webBundles,
} from "./web-format.js";
