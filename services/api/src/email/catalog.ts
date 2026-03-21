export type EmailLocale = "en" | "ru";

export const EMAIL_SUPPORTED_LOCALES: EmailLocale[] = ["en", "ru"];

export function resolveEmailLocale(
  requestedLocale: string | undefined,
  fallbackLocale: string,
): EmailLocale {
  const normalized = requestedLocale?.toLowerCase();
  if (normalized && EMAIL_SUPPORTED_LOCALES.includes(normalized as EmailLocale)) {
    return normalized as EmailLocale;
  }

  const fallback = fallbackLocale.toLowerCase();
  if (EMAIL_SUPPORTED_LOCALES.includes(fallback as EmailLocale)) {
    return fallback as EmailLocale;
  }

  return "en";
}

export type EmailTemplateId = "auth_email_code";

export interface AuthEmailCodeVariables {
  code: string;
  ttlSeconds: number;
}

export interface EmailTemplate<Vars> {
  render(locale: EmailLocale, variables: Vars): {
    subject: string;
    text: string;
    html: string;
  };
}

const authEmailCodeTemplate: EmailTemplate<AuthEmailCodeVariables> = {
  render(locale, variables) {
    const ttlMinutes = Math.ceil(variables.ttlSeconds / 60);
    if (locale === "ru") {
      return {
        subject: "Код входа в Okkey",
        text: `Ваш код входа: ${variables.code}. Код действует ${ttlMinutes} мин.`,
        html: `<p>Ваш код входа: <b>${variables.code}</b></p><p>Код действует ${ttlMinutes} мин.</p>`,
      };
    }

    return {
      subject: "Your Okkey sign-in code",
      text: `Your sign-in code is: ${variables.code}. This code expires in ${ttlMinutes} min.`,
      html: `<p>Your sign-in code is: <b>${variables.code}</b></p><p>This code expires in ${ttlMinutes} min.</p>`,
    };
  },
};

export const EMAIL_TEMPLATE_REGISTRY: {
  auth_email_code: EmailTemplate<AuthEmailCodeVariables>;
} = {
  auth_email_code: authEmailCodeTemplate,
};
