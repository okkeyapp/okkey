import type { SmtpTlsMode } from "../mail-settings/types.ts";

export type SmtpProviderTemplateId =
  | "custom"
  | "gmail"
  | "outlook"
  | "amazon_ses"
  | "mailgun"
  | "sendgrid"
  | "postmark";

export type SmtpProviderTemplate = {
  id: SmtpProviderTemplateId;
  smtpHost: string;
  smtpPort: number;
  smtpTlsMode: SmtpTlsMode;
  /** Optional username hint shown in UI (not applied blindly). */
  usernameHint?: string;
};

/** Common SMTP provider presets for the first-run mail step (autofill only). */
export const SMTP_PROVIDER_TEMPLATES: readonly SmtpProviderTemplate[] = [
  { id: "custom", smtpHost: "", smtpPort: 587, smtpTlsMode: "starttls" },
  {
    id: "gmail",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    usernameHint: "you@gmail.com",
  },
  {
    id: "outlook",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    usernameHint: "you@outlook.com",
  },
  {
    id: "amazon_ses",
    smtpHost: "email-smtp.us-east-1.amazonaws.com",
    smtpPort: 587,
    smtpTlsMode: "starttls",
  },
  {
    id: "mailgun",
    smtpHost: "smtp.mailgun.org",
    smtpPort: 587,
    smtpTlsMode: "starttls",
  },
  {
    id: "sendgrid",
    smtpHost: "smtp.sendgrid.net",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    usernameHint: "apikey",
  },
  {
    id: "postmark",
    smtpHost: "smtp.postmarkapp.com",
    smtpPort: 587,
    smtpTlsMode: "tls",
  },
] as const;

export function smtpProviderTemplate(
  id: string,
): SmtpProviderTemplate | null {
  return SMTP_PROVIDER_TEMPLATES.find((t) => t.id === id) ?? null;
}
