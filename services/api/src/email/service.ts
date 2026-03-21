import type { Logger } from "../logger.ts";
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
