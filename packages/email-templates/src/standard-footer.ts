import { formatEmailMessage, type EmailLocale } from "@okkey/i18n";

export type EmailStandardFooterCopy = {
  noReply: string;
  ignoreIfMistake: string;
};

export function buildEmailStandardFooterCopy(locale: EmailLocale): EmailStandardFooterCopy {
  return {
    noReply: formatEmailMessage(locale, "email.common.noReply", {}),
    ignoreIfMistake: formatEmailMessage(locale, "email.common.ignoreIfMistake", {}),
  };
}

/** Append shared no-reply + mistake lines to a plain-text body. */
export function appendStandardFooterPlain(
  body: string,
  copy: EmailStandardFooterCopy,
): string {
  const trimmed = body.trimEnd();
  return `${trimmed}\n\n${copy.noReply}\n${copy.ignoreIfMistake}`;
}
