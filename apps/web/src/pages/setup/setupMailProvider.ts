/** SMTP provider row as returned by `/public/setup/smtp-providers`. */
export type SetupMailProviderTemplate = {
  id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_tls_mode: "none" | "starttls" | "tls";
  username_hint?: string | null;
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
 * Switching away from a provider clears the username when it still equals that hint.
 */
export function applySetupMailProvider(
  previous: SetupMailProviderFields & { providerId: string },
  nextId: string,
  providers: readonly SetupMailProviderTemplate[],
): SetupMailProviderFields & { providerId: string } {
  const previousProvider = providers.find((p) => p.id === previous.providerId);
  const nextProvider = providers.find((p) => p.id === nextId);

  let smtpUsername = previous.smtpUsername;
  const previousHint = previousProvider?.username_hint?.trim() ?? "";
  if (previousHint && smtpUsername === previousHint) {
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

  return {
    providerId: nextId,
    smtpHost: nextProvider.smtp_host,
    smtpPort: String(nextProvider.smtp_port),
    smtpTlsMode: nextProvider.smtp_tls_mode,
    smtpUsername,
    usernamePlaceholder: nextProvider.username_hint?.trim() || "",
  };
}
