import type { Logger } from "../logger.ts";
import type { ApiConfig } from "../config.ts";
import {
  renderEmailTemplate,
  type AuthEmailCodeVariables,
  type DeviceApprovalRequestVariables,
  type WorkspaceInviteVariables,
  type TwoFactorNoticeVariables,
} from "./catalog.ts";
import { EmailTemplateError } from "./errors.ts";
import { resolveEmailLocaleForRecipient, type EmailLocaleHintsInput } from "./locale.ts";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
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
      subject: message.subject,
      ...(this.includePlainTextBody ? { plainText: message.text } : {}),
    });
  }
}

export class SmtpEmailSender implements EmailSender {
  private readonly transport: {
    sendMail(options: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<unknown>;
  };

  constructor(transport: {
    sendMail(options: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<unknown>;
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
        sendMail(options: {
          from: string;
          to: string;
          subject: string;
          text: string;
          html: string;
        }): Promise<unknown>;
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
    try {
      await this.transport.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
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
        body: JSON.stringify(message),
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

export async function createEmailSender(
  config: ApiConfig,
  logger: Logger,
): Promise<EmailSender> {
  switch (config.emailProvider) {
    case "logger":
      return new LoggerEmailSender(logger, {
        includePlainTextBody: shouldLogPlainTextForLoggerProvider(config),
      });
    case "smtp":
      return SmtpEmailSender.fromConfig(config);
    case "http-api":
      if (!config.emailApiEndpoint) {
        throw new Error("EMAIL_API_ENDPOINT is required for EMAIL_PROVIDER=http-api");
      }
      if (!config.emailApiKey) {
        throw new Error("EMAIL_API_KEY is required for EMAIL_PROVIDER=http-api");
      }
      return new HttpApiEmailSender(
        config.emailApiEndpoint,
        config.emailApiKey,
        config.emailApiTimeoutMs,
      );
    default:
      throw new Error(`unsupported email provider: ${config.emailProvider}`);
  }
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
        throw new EmailTemplateError(code, cause.message, {
          ...cause.details,
          originalCode: cause.code,
        });
      }
      throw new EmailTemplateError(
        "EMAIL_SEND_FAILED",
        "email transport failed",
        { cause: cause instanceof Error ? cause.message : String(cause) },
      );
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

  async sendTwoFactorEnabled(input: {
    to: string;
    localeHints: EmailLocaleHints;
    variables: TwoFactorNoticeVariables;
  }): Promise<void> {
    const locale = this.resolveLocale(input.localeHints);
    const rendered = await renderEmailTemplate("two_factor_enabled", locale, input.variables);
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
}
