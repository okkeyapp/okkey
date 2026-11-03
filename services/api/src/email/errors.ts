export type EmailPipelineErrorCode =
  | "EMAIL_TEMPLATE_NOT_FOUND"
  | "EMAIL_TEMPLATE_MISSING_VARIABLE"
  | "EMAIL_RENDER_FAILED"
  | "EMAIL_SEND_FAILED"
  | "EMAIL_TRANSPORT_ERROR";

export class EmailTemplateError extends Error {
  readonly code: EmailPipelineErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EmailPipelineErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EmailTemplateError";
    this.code = code;
    this.details = details;
  }
}

export function isEmailTransportFailureCode(code: EmailPipelineErrorCode): boolean {
  return code === "EMAIL_SEND_FAILED" || code === "EMAIL_TRANSPORT_ERROR";
}

/**
 * Redact a leading 6-digit verification code in an email subject for logs / dead-letter storage.
 * Leaves other digits (e.g. workspace names mid-subject) unchanged.
 */
export function sanitizeEmailSubjectForLogs(subject: string): string {
  return subject.replace(/^\d{6}\b/, "******");
}

/** Leading 6-digit verification code from an auth / email-change subject, if present. */
export function extractLeadingEmailVerificationCode(subject: string): string | undefined {
  const match = /^(\d{6})\b/.exec(subject);
  return match?.[1];
}

/**
 * Redact a verification code from subject / text / html for durable dead-letter inspection.
 * Only the code taken from a leading subject token is replaced (exact substring).
 */
export function redactEmailMessageForDeadLetter<
  T extends { subject: string; text: string; html: string },
>(message: T): T {
  const code = extractLeadingEmailVerificationCode(message.subject);
  const subject = sanitizeEmailSubjectForLogs(message.subject);
  if (!code) {
    return { ...message, subject };
  }
  const redact = (value: string): string => value.split(code).join("******");
  return {
    ...message,
    subject,
    text: redact(message.text),
    html: redact(message.html),
  };
}

/**
 * Internal/ops-facing reason (logs, dead-letter). Includes transport `cause` when present.
 */
export function formatEmailFailureReason(error: unknown): string {
  if (error instanceof EmailTemplateError) {
    const cause = error.details?.cause;
    if (typeof cause === "string" && cause.length > 0 && cause !== error.message) {
      return `${error.message}: ${cause}`;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Client-facing fields for EmailTemplateError. Omits host/port/provider guts
 * (e.g. SMTP ECONNREFUSED details) for transport/send failures.
 */
export function toPublicEmailErrorResponse(error: EmailTemplateError): {
  error: EmailPipelineErrorCode;
  message: string;
} {
  if (isEmailTransportFailureCode(error.code)) {
    return {
      error: "EMAIL_SEND_FAILED",
      message: "email send failed",
    };
  }
  return {
    error: error.code,
    message: error.message,
  };
}

/** HTTP status attached by SES / http-api transports (`details.status`). */
export function emailTransportHttpStatus(error: unknown): number | undefined {
  if (!(error instanceof EmailTemplateError)) {
    return undefined;
  }
  const status = error.details?.status;
  if (typeof status === "number" && Number.isFinite(status)) {
    return status;
  }
  return undefined;
}

/**
 * Whether the email queue consumer should retry after a transport failure.
 * Permanent HTTP 4xx (except 429) are not retryable; unknown/SMTP/5xx/429 are.
 */
export function isRetryableEmailSendFailure(error: unknown): boolean {
  const status = emailTransportHttpStatus(error);
  if (status === undefined) {
    return true;
  }
  if (status === 429) {
    return true;
  }
  if (status >= 400 && status < 500) {
    return false;
  }
  return true;
}
