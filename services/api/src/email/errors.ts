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
