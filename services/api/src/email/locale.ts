import type { EmailLocale } from "@okkey/i18n";
import { EMAIL_LOCALES } from "@okkey/i18n";

export type { EmailLocale };

export const EMAIL_SUPPORTED_LOCALES: EmailLocale[] = [...EMAIL_LOCALES];

/** Normalize `ru-RU`, `EN` → supported tag or null */
export function normalizeSupportedLocaleTag(raw: string | undefined | null): EmailLocale | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const base = raw.trim().toLowerCase().split("-")[0] ?? "";
  if (base === "ru" || base === "en") {
    return base;
  }
  return null;
}

/**
 * Pick final template locale: instance default chain, then hard `en`.
 * @deprecated Prefer {@link resolveEmailLocaleForRecipient} for outbound mail.
 */
export function resolveEmailLocale(
  requestedLocale: string | undefined,
  fallbackLocale: string,
): EmailLocale {
  const fromRequest = normalizeSupportedLocaleTag(requestedLocale);
  if (fromRequest) {
    return fromRequest;
  }

  const fromFallback = normalizeSupportedLocaleTag(fallbackLocale);
  if (fromFallback) {
    return fromFallback;
  }

  return "en";
}

/**
 * First supported language from an `Accept-Language` header value.
 */
export function parsePrimaryLocaleFromAcceptLanguage(
  header: string | undefined | null,
): EmailLocale | null {
  if (!header?.trim()) {
    return null;
  }
  const parts = header.split(",");
  for (const part of parts) {
    const tag = part.split(";")[0]?.trim();
    if (!tag) {
      continue;
    }
    const match = normalizeSupportedLocaleTag(tag);
    if (match) {
      return match;
    }
  }
  return null;
}

export interface EmailLocaleHintsInput {
  /** Saved user preference (`users.locale`) */
  userLocale?: string | null;
  /** Explicit API field e.g. `locale` in JSON body */
  explicitLocale?: string | null;
  /** Raw `Accept-Language` header */
  acceptLanguage?: string | null;
  instanceDefault: string;
}

/**
 * Product rule: user profile → explicit client locale → Accept-Language → instance default → `en`.
 */
export function resolveEmailLocaleForRecipient(input: EmailLocaleHintsInput): EmailLocale {
  const fromUser = normalizeSupportedLocaleTag(input.userLocale ?? undefined);
  if (fromUser) {
    return fromUser;
  }
  const fromExplicit = normalizeSupportedLocaleTag(input.explicitLocale ?? undefined);
  if (fromExplicit) {
    return fromExplicit;
  }
  const fromHeader = parsePrimaryLocaleFromAcceptLanguage(input.acceptLanguage);
  if (fromHeader) {
    return fromHeader;
  }
  return resolveEmailLocale(undefined, input.instanceDefault);
}
