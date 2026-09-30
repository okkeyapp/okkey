import { WEB_LOCALES, type WebLocale } from "@okkey/i18n";

/** Same key as the extension popup language switcher. */
export const EXTENSION_LOCALE_STORAGE_KEY = "okkey.extension.locale";

export function readStoredExtensionLocale(): WebLocale {
  try {
    const raw = localStorage.getItem(EXTENSION_LOCALE_STORAGE_KEY);
    if (raw && (WEB_LOCALES as string[]).includes(raw)) {
      return raw as WebLocale;
    }
  } catch {
    // ignore
  }
  return "ru";
}

export function writeStoredExtensionLocale(locale: WebLocale): void {
  try {
    localStorage.setItem(EXTENSION_LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}
