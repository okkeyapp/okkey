/** Classify SMTP test failures by API `body.error` — never show raw server text. */
export type SmtpTestErrorKind = "timeout" | "auth" | "connectionRefused" | "tls" | "generic";

export function smtpTestErrorKind(error: unknown): SmtpTestErrorKind {
  if (!error || typeof error !== "object" || !("body" in error)) {
    return "generic";
  }
  const code = (error as { body?: { error?: unknown } }).body?.error;
  if (code === "SMTP_TIMEOUT") {
    return "timeout";
  }
  if (code === "SMTP_AUTH_FAILED") {
    return "auth";
  }
  if (code === "SMTP_CONNECTION_REFUSED") {
    return "connectionRefused";
  }
  if (code === "SMTP_TLS_ERROR") {
    return "tls";
  }
  return "generic";
}

/** i18n message keys for SMTP test failures (web.workspaceSettings.serverMail.*). */
export function smtpTestErrorMessageKey(kind: SmtpTestErrorKind): string {
  switch (kind) {
    case "timeout":
      return "web.workspaceSettings.serverMail.testErrorTimeout";
    case "auth":
      return "web.workspaceSettings.serverMail.testErrorAuth";
    case "connectionRefused":
      return "web.workspaceSettings.serverMail.testErrorConnectionRefused";
    case "tls":
      return "web.workspaceSettings.serverMail.testErrorTls";
    default:
      return "web.workspaceSettings.serverMail.testError";
  }
}
