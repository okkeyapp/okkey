/** Stable API codes for interactive SMTP test failures (never include secrets). */
export type SmtpTestErrorCode =
  | "SMTP_TIMEOUT"
  | "SMTP_AUTH_FAILED"
  | "SMTP_CONNECTION_REFUSED"
  | "SMTP_TLS_ERROR"
  | "EMAIL_TRANSPORT_ERROR";

const SAFE_MESSAGES: Record<SmtpTestErrorCode, string> = {
  SMTP_TIMEOUT: "smtp connection timed out",
  SMTP_AUTH_FAILED: "smtp authentication failed",
  SMTP_CONNECTION_REFUSED: "smtp connection refused",
  SMTP_TLS_ERROR: "smtp tls/ssl error",
  EMAIL_TRANSPORT_ERROR: "smtp send failed",
};

/** Map nodemailer / OS error text to a stable code. Password must already be redacted. */
export function classifySmtpTransportError(cause: string): SmtpTestErrorCode {
  const text = cause.toLowerCase();
  if (
    /timed?\s*out|timeout|etimedout|esockettimedout|connection timed out|greeting never received/.test(
      text,
    )
  ) {
    return "SMTP_TIMEOUT";
  }
  if (
    /eauth|invalid login|authentication failed|auth(?:entication)? (?:failed|required)|535|534|username and password|bad credentials|incorrect authentication/.test(
      text,
    )
  ) {
    return "SMTP_AUTH_FAILED";
  }
  if (/econnrefused|connection refused/.test(text)) {
    return "SMTP_CONNECTION_REFUSED";
  }
  if (
    /wrong version number|ssl|tls|certificate|self[- ]signed|cert_|openssl|secure socks|unable to verify/.test(
      text,
    )
  ) {
    return "SMTP_TLS_ERROR";
  }
  return "EMAIL_TRANSPORT_ERROR";
}

export function smtpTestErrorSafeMessage(code: SmtpTestErrorCode): string {
  return SAFE_MESSAGES[code];
}
