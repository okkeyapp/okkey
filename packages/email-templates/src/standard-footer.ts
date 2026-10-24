import { formatEmailMessage, type EmailLocale } from "@okkey/i18n";

export type EmailStandardFooterCopy = {
  noReply: string;
  /** Empty for security emails that must not suggest ignoring the message. */
  ignoreIfMistake: string;
};

export function buildEmailStandardFooterCopy(locale: EmailLocale): EmailStandardFooterCopy {
  return {
    noReply: formatEmailMessage(locale, "email.common.noReply", {}),
    ignoreIfMistake: formatEmailMessage(locale, "email.common.ignoreIfMistake", {}),
  };
}

/** No-reply only — used for security notices where “ignore” contradicts the call to action. */
export function buildEmailSecurityFooterCopy(locale: EmailLocale): EmailStandardFooterCopy {
  return {
    noReply: formatEmailMessage(locale, "email.common.noReply", {}),
    ignoreIfMistake: "",
  };
}

/** Append shared footer lines to a plain-text body (skips empty ignore). */
export function appendStandardFooterPlain(
  body: string,
  copy: EmailStandardFooterCopy,
): string {
  const trimmed = body.trimEnd();
  const ignore = copy.ignoreIfMistake.trim();
  if (ignore.length === 0) {
    return `${trimmed}\n\n${copy.noReply}`;
  }
  return `${trimmed}\n\n${copy.noReply}\n${ignore}`;
}
