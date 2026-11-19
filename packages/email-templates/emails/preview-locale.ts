import { FALLBACK_LOCALE, isEmailLocale, type EmailLocale } from "@okkey/i18n";

const raw = (process.env.EMAIL_PREVIEW_LOCALE ?? FALLBACK_LOCALE).trim().toLowerCase();

export const PREVIEW_LOCALE: EmailLocale = isEmailLocale(raw) ? raw : FALLBACK_LOCALE;
