/** SMTP provider row as returned by `/public/setup/smtp-providers`. */
export type SetupMailProviderTemplate = {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_tls_mode: "none" | "starttls" | "tls";
  username_hint?: string | null;
  default_username?: string | null;
};

export type SetupMailProviderFields = {
  smtpHost: string;
  smtpPort: string;
  smtpTlsMode: "none" | "starttls" | "tls";
  smtpUsername: string;
  usernamePlaceholder: string;
};

/**
 * Apply a provider template to mail fields.
 * Username hints are placeholders only — never written as the input value.
 * Providers with `default_username` (e.g. SendGrid `apikey`) prefill that value
 * when the field is empty. Switching away clears an unedited default/hint value;
 * a username the operator typed themselves is preserved. Password is untouched.
 */
export function applySetupMailProvider(
  previous: SetupMailProviderFields & { providerId: string },
  nextId: string,
  providers: readonly SetupMailProviderTemplate[],
): SetupMailProviderFields & { providerId: string } {
  const previousProvider = providers.find((p) => p.id === previous.providerId);
  const nextProvider = providers.find((p) => p.id === nextId);

  let smtpUsername = previous.smtpUsername;
  const previousDefault = previousProvider?.default_username?.trim() ?? "";
  const previousHint = previousProvider?.username_hint?.trim() ?? "";
  if (
    (previousDefault && smtpUsername === previousDefault) ||
    (previousHint && smtpUsername === previousHint)
  ) {
    smtpUsername = "";
  }

  if (!nextProvider || nextId === "custom") {
    return {
      providerId: nextId,
      smtpHost: previous.smtpHost,
      smtpPort: previous.smtpPort,
      smtpTlsMode: previous.smtpTlsMode,
      smtpUsername,
      usernamePlaceholder: "",
    };
  }

  const nextDefault = nextProvider.default_username?.trim() ?? "";
  if (nextDefault && !smtpUsername) {
    smtpUsername = nextDefault;
  }

  return {
    providerId: nextId,
    smtpHost: nextProvider.smtp_host,
    smtpPort: String(nextProvider.smtp_port),
    smtpTlsMode: nextProvider.smtp_tls_mode,
    smtpUsername,
    usernamePlaceholder: nextProvider.username_hint?.trim() || "",
  };
}
