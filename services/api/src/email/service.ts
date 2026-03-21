import type { Logger } from "../logger.ts";
import type { ApiConfig } from "../config.ts";
import {
  EMAIL_TEMPLATE_REGISTRY,
  resolveEmailLocale,
  type AuthEmailCodeVariables,
} from "./catalog.ts";

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

export class LoggerEmailSender implements EmailSender {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async send(message: EmailMessage): Promise<void> {
    this.logger.info("email sent", {
      to: message.to,
      from: message.from,
      subject: message.subject,
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
    await this.transport.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
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
        throw new Error(`email api send failed: status ${response.status}`);
      }
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
      return new LoggerEmailSender(logger);
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

export class EmailTemplateService {
  private readonly sender: EmailSender;
  private readonly from: string;
  private readonly fallbackLocale: string;

  constructor(
    sender: EmailSender,
    from: string,
    fallbackLocale: string,
  ) {
    this.sender = sender;
    this.from = from;
    this.fallbackLocale = fallbackLocale;
  }

  async sendAuthEmailCode(input: {
    to: string;
    locale?: string;
    variables: AuthEmailCodeVariables;
  }): Promise<void> {
    const locale = resolveEmailLocale(input.locale, this.fallbackLocale);
    const rendered = EMAIL_TEMPLATE_REGISTRY.auth_email_code.render(
      locale,
      input.variables,
    );

    await this.sender.send({
      to: input.to,
      from: this.from,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  }
}
