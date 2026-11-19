import { EMAIL_LOCALES, emailBundles, type EmailLocale } from "./email-bundles.gen.js";
import { isAppLocale, type AppLocale } from "./locale-meta.js";

export type { EmailLocale };
export { EMAIL_LOCALES, emailBundles };

/** EmailLocale is the shared AppLocale set (web ↔ email JSON parity). */
export type { AppLocale };

export function isEmailLocale(value: string): value is EmailLocale {
  return Object.prototype.hasOwnProperty.call(emailBundles, value);
}

/** Prefer {@link isEmailLocale}; kept for call sites that already use AppLocale checks. */
export function isSupportedEmailLocale(value: string): value is AppLocale {
  return isAppLocale(value) && isEmailLocale(value);
}
