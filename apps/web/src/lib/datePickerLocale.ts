import { dateFnsLocaleId, type WebLocale } from "@okkey/i18n";
import { de, enUS, es, fr, nl, ptBR, ru, type Locale } from "date-fns/locale";

/** date-fns locale modules keyed by manifest `dateFns` ids. Unknown → enUS. */
const DATE_FNS_BY_ID: Record<string, Locale> = {
  enUS,
  ru,
  de,
  fr,
  es,
  ptBR,
  nl,
};

export function getDatePickerLocale(locale: WebLocale): Locale {
  const id = dateFnsLocaleId(locale);
  return DATE_FNS_BY_ID[id] ?? enUS;
}
