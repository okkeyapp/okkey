import type { ApiConfig } from "../config.ts";
import {
  isOutboundEmailDeliverable,
  SMTP_TEST_CONNECTION_TIMEOUT_MS,
  type EmailMessage,
  type EmailSender,
} from "../email/service.ts";
import type { MailSettingsService } from "../mail-settings/service.ts";

/**
 * Message shape plugins may pass to {@link ApiEnterprisePluginContext.sendOutboundEmail}.
 * Does not accept SMTP credentials or other secret-bearing fields.
 */
export type PluginOutboundEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Same connect/send budget as Core interactive SMTP test sends. */
export const PLUGIN_OUTBOUND_MAIL_TIMEOUT_MS = SMTP_TEST_CONNECTION_TIMEOUT_MS;

export type PluginOutboundMailApi = {
  isOutboundMailActive(): Promise<boolean>;
  sendOutboundEmail(message: PluginOutboundEmailMessage): Promise<void>;
};

export type PluginOutboundMailDeps = {
  config: ApiConfig;
  /**
   * When present, activity matches Core OTP/invite mail (`MailSettingsService.isOutboundActive`).
   * When absent, falls back to env-based {@link isOutboundEmailDeliverable}.
   */
  mailSettings?: Pick<MailSettingsService, "isOutboundActive" | "effective">;
  /** Same outbound sender Core uses for OTP / invite mail. */
  emailSender?: EmailSender;
  /** Process-env From used when mail settings do not supply one. */
  fallbackFrom: string;
  /** Override for tests; defaults to {@link PLUGIN_OUTBOUND_MAIL_TIMEOUT_MS}. */
  sendTimeoutMs?: number;
};

async function raceWithTimeout<T>(
  action: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Plugin-facing outbound mail helpers that mirror Core OTP/invite delivery:
 * DB-verified SMTP when mail settings are active, otherwise env deliverability.
 * Never exposes SMTP passwords or other secret material.
 */
export function createPluginOutboundMailApi(deps: PluginOutboundMailDeps): PluginOutboundMailApi {
  const timeoutMs =
    typeof deps.sendTimeoutMs === "number" &&
    Number.isFinite(deps.sendTimeoutMs) &&
    deps.sendTimeoutMs > 0
      ? deps.sendTimeoutMs
      : PLUGIN_OUTBOUND_MAIL_TIMEOUT_MS;

  return {
    async isOutboundMailActive(): Promise<boolean> {
      if (deps.mailSettings) {
        return deps.mailSettings.isOutboundActive();
      }
      return isOutboundEmailDeliverable(deps.config);
    },

    async sendOutboundEmail(message: PluginOutboundEmailMessage): Promise<void> {
      if (!deps.emailSender) {
        throw new Error("outbound email sender is not configured");
      }
      const to = message.to.trim();
      const subject = message.subject.trim();
      const text = message.text;
      const html = message.html;
      if (!to || !subject) {
        throw new Error("outbound email requires to and subject");
      }

      let from = deps.fallbackFrom.trim();
      if (deps.mailSettings) {
        const effective = await deps.mailSettings.effective();
        const resolved = effective.emailFrom.trim();
        if (resolved) {
          from = resolved;
        }
      }
      if (!from) {
        throw new Error("outbound email From address is not configured");
      }

      const payload: EmailMessage = {
        to,
        from,
        subject,
        text,
        html,
      };

      const sendPromise = deps.emailSender.send(payload);
      try {
        await raceWithTimeout(
          sendPromise,
          timeoutMs,
          `outbound email send timed out after ${Math.max(1, Math.ceil(timeoutMs / 1000))}s`,
        );
      } catch (error) {
        void sendPromise.catch(() => undefined);
        throw error;
      }
    },
  };
}
