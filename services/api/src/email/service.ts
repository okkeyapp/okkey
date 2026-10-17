import type { Logger } from "../logger.ts";
import type { ApiConfig } from "../config.ts";
import {
  renderEmailTemplate,
  type AccountEmailChangedVariables,
  type AuthEmailCodeVariables,
  type ContactRecoveryReleaseRequestVariables,
  type DeviceApprovalRequestVariables,
  type DeviceRecoveryApprovalRequestVariables,
  type TrustedContactInviteVariables,
  type WorkspaceInviteVariables,
  type TwoFactorNoticeVariables,
} from "./catalog.ts";
import { EmailTemplateError, sanitizeEmailSubjectForLogs } from "./errors.ts";
import { resolveEmailLocaleForRecipient, type EmailLocaleHintsInput } from "./locale.ts";
import {
  QueuedEmailSender,
  type EmailDeliveryMode,
  type EmailQueueRedis,
} from "./queue.ts";
import { withOkkeyMarkInlineAttachment } from "./inline-attachments.ts";
import { SesEmailSender } from "./ses-sender.ts";

/** Inline (CID) attachment referenced from HTML as `cid:<cid>`. */
export interface EmailInlineAttachment {
  cid: string;
  filename: string;
  contentType: string;
  /** Raw base64 of file bytes (no data: URI prefix). */
  contentBase64: string;
}

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  /** Optional; transports also inject the Okkey mark when HTML uses its CID. */
  inlineAttachments?: EmailInlineAttachment[];
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailLocaleHints {
  userLocale?: string | null;
  explicitLocale?: string | null;
  acceptLanguage?: string | null;
}

export interface EmailTemplateServiceOptions {
  from: string;
  defaultLocale: string;
  publicAppBaseUrl: string;
  /** When send fails after successful render; omit to throw */
  logger?: Pick<Logger, "warn" | "error">;
}

export function buildEmailAppPathUrl(publicAppBaseUrl: string, path: string): string {
  const base = publicAppBaseUrl.trim().replace(/\/$/, "");
  if (!base) {
    return "";
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export type LoggerEmailSenderOptions = {
  /**
   * When true, log the plain-text body (e.g. OTP) alongside metadata.
   * See {@link shouldLogPlainTextForLoggerProvider} for when this is enabled for `EMAIL_PROVIDER=logger`.
   */
  includePlainTextBody?: boolean;
};

function shouldLogPlainTextForLoggerProvider(config: ApiConfig): boolean {
  if (config.emailProvider !== "logger") {
    return false;
  }
  const flag = process.env.EMAIL_LOG_PLAINTEXT;
  if (flag !== undefined) {
    const v = flag.toLowerCase().trim();
    if (v === "false" || v === "0" || v === "no") {
      return false;
    }
    if (v === "true" || v === "1" || v === "yes") {
      return true;
    }
  }
  // Local stacks often use NODE_ENV=production but DEPLOY_ENV=dev; real prod should use deployEnv=prod.
  return config.deployEnv === "dev" || config.nodeEnv !== "production";
}

export class LoggerEmailSender implements EmailSender {
  private readonly logger: Logger;
  private readonly includePlainTextBody: boolean;

  constructor(logger: Logger, options: LoggerEmailSenderOptions = {}) {
    this.logger = logger;
    this.includePlainTextBody = options.includePlainTextBody === true;
  }

  async send(message: EmailMessage): Promise<void> {
    this.logger.info("email sent", {
      to: message.to,
      from: message.from,
      subject: sanitizeEmailSubjectForLogs(message.subject),
      ...(this.includePlainTextBody ? { plainText: message.text } : {}),
    });
  }
}

type NodemailerAttachment = {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
  contentDisposition: "inline";
};

type NodemailerSendMailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: NodemailerAttachment[];
};

export class SmtpEmailSender implements EmailSender {
  private readonly transport: {
    sendMail(options: NodemailerSendMailOptions): Promise<unknown>;
  };

  constructor(transport: {
    sendMail(options: NodemailerSendMailOptions): Promise<unknown>;
  }) {
    this.transport = transport;
  }

  static async fromConfig(config: ApiConfig): Promise<SmtpEmailSender> {
    const nodemailerModule = (await import("nodemailer")) as {
      createTransport(options: {
        host: string;
        port: number;
        secure: boolean;
        auth?: { user: string; pass: string };
      }): {
        sendMail(options: NodemailerSendMailOptions): Promise<unknown>;
      };
    };

    const transport = nodemailerModule.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth:
        config.smtpUser && config.smtpPassword
          ? {
              user: config.smtpUser,
              pass: config.smtpPassword,
            }
          : undefined,
    });

    return new SmtpEmailSender(transport);
  }

  async send(message: EmailMessage): Promise<void> {
    const prepared = withOkkeyMarkInlineAttachment(message);
    const attachments: NodemailerAttachment[] | undefined =
      prepared.inlineAttachments && prepared.inlineAttachments.length > 0
        ? prepared.inlineAttachments.map((item) => ({
            filename: item.filename,
            content: Buffer.from(item.contentBase64, "base64"),
            cid: item.cid,
            contentType: item.contentType,
            contentDisposition: "inline",
          }))
        : undefined;
    try {
      await this.transport.sendMail({
        from: prepared.from,
        to: prepared.to,
        subject: prepared.subject,
        text: prepared.text,
        html: prepared.html,
        ...(attachments ? { attachments } : {}),
      });
    } catch (cause) {
      throw new EmailTemplateError(
        "EMAIL_TRANSPORT_ERROR",
        "smtp send failed",
        { cause: cause instanceof Error ? cause.message : String(cause) },
      );
    }
  }
}

export class HttpApiEmailSender implements EmailSender {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(endpoint: string, apiKey: string, timeoutMs: number) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async send(message: EmailMessage): Promise<void> {
    const prepared = withOkkeyMarkInlineAttachment(message);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(prepared),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new EmailTemplateError(
          "EMAIL_TRANSPORT_ERROR",
          `email api send failed: status ${response.status}`,
          { status: response.status },
        );
      }
    } catch (cause) {
      if (cause instanceof EmailTemplateError) {
        throw cause;
      }
      throw new EmailTemplateError(
        "EMAIL_TRANSPORT_ERROR",
        cause instanceof Error ? cause.message : "email api request failed",
        { cause: cause instanceof Error ? cause.message : String(cause) },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type CreateEmailSenderOptions = {
  /**
   * `transport` — real provider (SMTP/SES/logger/http-api). Used by the worker consumer.
   * `outbound` — API path: Redis queue when `emailDeliveryMode=queue`, else same as transport.
   */
  role?: "transport" | "outbound";
  redis?: EmailQueueRedis;
  /** Override config.emailDeliveryMode (tests). */
  deliveryMode?: EmailDeliveryMode;
};

/**
 * Fail-fast config checks for the configured EMAIL_PROVIDER.
 * Used by the worker transport and by the API even in `queue` mode, so a bad
 * SES/http-api env cannot leave the process healthy while mail piles up.
 */
export function assertEmailTransportConfig(config: ApiConfig): void {
  switch (config.emailProvider) {
    case "logger":
    case "smtp":
      return;
    case "http-api":
      if (!config.emailApiEndpoint) {
        throw new Error("EMAIL_API_ENDPOINT is required for EMAIL_PROVIDER=http-api");
      }
      if (!config.emailApiKey) {
        throw new Error("EMAIL_API_KEY is required for EMAIL_PROVIDER=http-api");
      }
      return;
    case "ses":
      if (!config.sesRegion) {
        throw new Error("EMAIL_SES_REGION is required for EMAIL_PROVIDER=ses");
      }
      if (!config.sesAccessKeyId) {
        throw new Error("EMAIL_SES_ACCESS_KEY_ID is required for EMAIL_PROVIDER=ses");
      }
      if (!config.sesSecretAccessKey) {
        throw new Error("EMAIL_SES_SECRET_ACCESS_KEY is required for EMAIL_PROVIDER=ses");
      }
      return;
    default:
      throw new Error(`unsupported email provider: ${config.emailProvider}`);
  }
}

/** Create the provider that actually delivers mail (SMTP / SES / logger / http-api). */
export async function createTransportEmailSender(
  config: ApiConfig,
  logger: Logger,
): Promise<EmailSender> {
  assertEmailTransportConfig(config);
  switch (config.emailProvider) {
    case "logger":
      return new LoggerEmailSender(logger, {
        includePlainTextBody: shouldLogPlainTextForLoggerProvider(config),
      });
    case "smtp":
      return SmtpEmailSender.fromConfig(config);
    case "http-api":
      return new HttpApiEmailSender(
        config.emailApiEndpoint,
        config.emailApiKey,
        config.emailApiTimeoutMs,
      );
    case "ses":
      return new SesEmailSender({
        region: config.sesRegion,
        accessKeyId: config.sesAccessKeyId,
        secretAccessKey: config.sesSecretAccessKey,
        endpoint: config.sesEndpoint || undefined,
        timeoutMs: config.sesTimeoutMs,
      });
    default:
      throw new Error(`unsupported email provider: ${config.emailProvider}`);
  }
}

/**
 * Outbound sender for the API process.
 * In `queue` mode enqueues rendered messages to Redis; worker delivers via transport.
 * In `sync` mode (default outside production) sends immediately — fine for local logger + tests.
 * Transport config is always validated so queue mode cannot accept mail with a broken provider env.
 */
export async function createOutboundEmailSender(
  config: ApiConfig,
  logger: Logger,
  redis: EmailQueueRedis,
): Promise<EmailSender> {
  assertEmailTransportConfig(config);
  if (config.emailDeliveryMode === "queue") {
    return new QueuedEmailSender(redis, logger);
  }
  return createTransportEmailSender(config, logger);
}

/** @deprecated Prefer {@link createTransportEmailSender} or {@link createOutboundEmailSender}. */
export async function createEmailSender(
  config: ApiConfig,
  logger: Logger,
  options: CreateEmailSenderOptions = {},
): Promise<EmailSender> {
  const role = options.role ?? "transport";
  if (role === "outbound") {
    if (!options.redis) {
      throw new Error("redis is required when createEmailSender role=outbound");
    }
    const mode = options.deliveryMode ?? config.emailDeliveryMode;
    if (mode === "queue") {
      return new QueuedEmailSender(options.redis, logger);
    }
    return createTransportEmailSender(config, logger);
  }
  return createTransportEmailSender(config, logger);
}

function toHintsInput(
  hints: EmailLocaleHints,
  instanceDefault: string,
): EmailLocaleHintsInput {
  return {
    userLocale: hints.userLocale,
    explicitLocale: hints.explicitLocale,
    acceptLanguage: hints.acceptLanguage,
    instanceDefault,
  };
}

export class EmailTemplateService {
  private readonly sender: EmailSender;
  private readonly from: string;
  private readonly defaultLocale: string;
  private readonly publicAppBaseUrl: string;
  private readonly logger?: Pick<Logger, "warn" | "error">;

  constructor(sender: EmailSender, options: EmailTemplateServiceOptions) {
    this.sender = sender;
    this.from = options.from;
    this.defaultLocale = options.defaultLocale;
    this.publicAppBaseUrl = options.publicAppBaseUrl;
    this.logger = options.logger;
  }

  private resolveLocale(hints: EmailLocaleHints): ReturnType<
    typeof resolveEmailLocaleForRecipient
  > {
    return resolveEmailLocaleForRecipient(toHintsInput(hints, this.defaultLocale));
  }

  private async dispatchRendered(to: string, rendered: { subject: string; text: string; html: string }): Promise<void> {
    try {
      await this.sender.send({
        to,
        from: this.from,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (cause) {
      if (cause instanceof EmailTemplateError) {
        const code: EmailTemplateError["code"] =
          cause.code === "EMAIL_TRANSPORT_ERROR" ? "EMAIL_SEND_FAILED" : cause.code;
        const wrapped = new EmailTemplateError(code, cause.message, {
          ...cause.details,
          originalCode: cause.code,
        });
        this.logger?.error("email send failed", {
          code: wrapped.code,
          message: wrapped.message,
          ...(typeof wrapped.details?.cause === "string"
            ? { cause: wrapped.details.cause }
            : {}),
        });
        throw wrapped;
      }
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.logger?.error("email send failed", {
        code: "EMAIL_SEND_FAILED",
        message: "email transport failed",
        cause: reason,
      });
      throw new EmailTemplateError("EMAIL_SEND_FAILED", "email transport failed", {
        cause: reason,
      });
    }
  }

  async sendAuthEmailCode(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: AuthEmailCodeVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate("auth_email_code", locale, input.variables);
    await this.dispatchRendered(input.to, rendered);
  }

  async sendDeviceApprovalRequest(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: DeviceApprovalRequestVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate(
      "device_approval_request",
      locale,
      input.variables,
    );
    await this.dispatchRendered(input.to, rendered);
  }

  async sendWorkspaceInvite(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: WorkspaceInviteVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate("workspace_invite", locale, input.variables);
    await this.dispatchRendered(input.to, rendered);
  }

  async sendPlanChangeRequest(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: import("@okkey/email-templates").PlanChangeRequestVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate("plan_change_request", locale, input.variables);
    await this.dispatchRendered(input.to, rendered);
  }

  async sendTwoFactorEnabled(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: TwoFactorNoticeVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate("two_factor_enabled", locale, input.variables);
    await this.dispatchRendered(input.to, rendered);
  }

  async sendTwoFactorDisabled(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: TwoFactorNoticeVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate("two_factor_disabled", locale, input.variables);
    await this.dispatchRendered(input.to, rendered);
  }

  async sendTwoFactorBackupCodesRegenerated(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: TwoFactorNoticeVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate(
      "two_factor_backup_codes_regenerated",
      locale,
      input.variables,
    );
    await this.dispatchRendered(input.to, rendered);
  }

  /**
   * Same as {@link sendTwoFactorEnabled} but never throws: API success should not depend on mail.
   */
  async sendTwoFactorEnabledBestEffort(input: Parameters<EmailTemplateService["sendTwoFactorEnabled"]>[0]): Promise<void> {
    try {
      await this.sendTwoFactorEnabled(input);
    } catch (error) {
      const code = error instanceof EmailTemplateError ? error.code : "EMAIL_SEND_FAILED";
      this.logger?.warn("two_factor_enabled email skipped", {
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Same as {@link sendTwoFactorDisabled} but never throws: API success should not depend on mail.
   */
  async sendTwoFactorDisabledBestEffort(
    input: Parameters<EmailTemplateService["sendTwoFactorDisabled"]>[0],
  ): Promise<void> {
    try {
      await this.sendTwoFactorDisabled(input);
    } catch (error) {
      const code = error instanceof EmailTemplateError ? error.code : "EMAIL_SEND_FAILED";
      this.logger?.warn("two_factor_disabled email skipped", {
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Same as {@link sendTwoFactorBackupCodesRegenerated} but never throws.
   */
  async sendTwoFactorBackupCodesRegeneratedBestEffort(
    input: Parameters<EmailTemplateService["sendTwoFactorBackupCodesRegenerated"]>[0],
  ): Promise<void> {
    try {
      await this.sendTwoFactorBackupCodesRegenerated(input);
    } catch (error) {
      const code = error instanceof EmailTemplateError ? error.code : "EMAIL_SEND_FAILED";
      this.logger?.warn("two_factor_backup_codes_regenerated email skipped", {
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendAccountEmailChanged(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: AccountEmailChangedVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate("account_email_changed", locale, input.variables);
    await this.dispatchRendered(input.to, rendered);
  }

  /**
   * Same as {@link sendAccountEmailChanged} but never throws: confirm must succeed even if mail fails.
   */
  async sendAccountEmailChangedBestEffort(
    input: Parameters<EmailTemplateService["sendAccountEmailChanged"]>[0],
  ): Promise<void> {
    try {
      await this.sendAccountEmailChanged(input);
    } catch (error) {
      const code = error instanceof EmailTemplateError ? error.code : "EMAIL_SEND_FAILED";
      this.logger?.warn("account_email_changed email skipped", {
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendDeviceRecoveryApprovalRequest(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: DeviceRecoveryApprovalRequestVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate(
      "device_recovery_approval_request",
      locale,
      input.variables,
    );
    await this.dispatchRendered(input.to, rendered);
  }

  async sendDeviceRecoveryApprovalRequestBestEffort(
    input: Parameters<EmailTemplateService["sendDeviceRecoveryApprovalRequest"]>[0],
  ): Promise<void> {
    try {
      await this.sendDeviceRecoveryApprovalRequest(input);
    } catch (error) {
      const code = error instanceof EmailTemplateError ? error.code : "EMAIL_SEND_FAILED";
      this.logger?.warn("device_recovery_approval_request email skipped", {
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendContactRecoveryReleaseRequest(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: ContactRecoveryReleaseRequestVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate(
      "contact_recovery_release_request",
      locale,
      input.variables,
    );
    await this.dispatchRendered(input.to, rendered);
  }

  async sendContactRecoveryReleaseRequestBestEffort(
    input: Parameters<EmailTemplateService["sendContactRecoveryReleaseRequest"]>[0],
  ): Promise<void> {
    try {
      await this.sendContactRecoveryReleaseRequest(input);
    } catch (error) {
      const code = error instanceof EmailTemplateError ? error.code : "EMAIL_SEND_FAILED";
      this.logger?.warn("contact_recovery_release_request email skipped", {
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendTrustedContactInvite(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: TrustedContactInviteVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate(
      "trusted_contact_invite",
      locale,
      input.variables,
    );
    await this.dispatchRendered(input.to, rendered);
  }

  async sendTrustedContactInviteBestEffort(
    input: Parameters<EmailTemplateService["sendTrustedContactInvite"]>[0],
  ): Promise<void> {
    try {
      await this.sendTrustedContactInvite(input);
    } catch (error) {
      const code = error instanceof EmailTemplateError ? error.code : "EMAIL_SEND_FAILED";
      this.logger?.warn("trusted_contact_invite email skipped", {
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
