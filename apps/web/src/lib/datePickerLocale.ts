import type { WebLocale } from "@okkey/i18n";
import { enUS, ru, type Locale } from "date-fns/locale";

export function getDatePickerLocale(locale: WebLocale): Locale {
  return locale === "ru" ? ru : enUS;
}
