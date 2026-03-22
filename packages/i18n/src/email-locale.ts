export type EmailLocale = "en" | "ru";

export const EMAIL_LOCALES: EmailLocale[] = ["en", "ru"];

export function isEmailLocale(value: string): value is EmailLocale {
  return value === "en" || value === "ru";
}
