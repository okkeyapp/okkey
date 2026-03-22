export type EmailRenderErrorCode =
  | "EMAIL_TEMPLATE_MISSING_VARIABLE"
  | "EMAIL_RENDER_FAILED";

export class EmailRenderError extends Error {
  readonly code: EmailRenderErrorCode;
  readonly templateId?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EmailRenderErrorCode,
    message: string,
    options?: { templateId?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "EmailRenderError";
    this.code = code;
    this.templateId = options?.templateId;
    this.details = options?.details;
  }
}
