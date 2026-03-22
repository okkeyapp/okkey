import type { EmailLocale } from "@okkey/i18n";

const raw = (process.env.EMAIL_PREVIEW_LOCALE ?? "en").toLowerCase();
export const PREVIEW_LOCALE: EmailLocale = raw === "ru" ? "ru" : "en";
