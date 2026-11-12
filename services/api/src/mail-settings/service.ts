import type { ApiConfig } from "../config.ts";
import { deriveSmtpPasswordKey, openSecret, sealSecret } from "../crypto/server-aes.ts";
import { wipeSecretBytes } from "../crypto/secret-lifecycle.ts";
import type { EmailMessage } from "../email/service.ts";
import { SmtpEmailSender } from "../email/service.ts";
import type { Logger } from "../logger.ts";
import type {
  MailDeliverySnapshot,
  ServerMailSettingsPatch,
  ServerMailSettingsPublic,
  ServerMailSettingsRow,
  ServerMailSettingsStore,
  SmtpTlsMode,
} from "./types.ts";
import {
  parseEmailFrom,
  parsePublicAppUrl,
  parseSmtpHost,
  parseSmtpPassword,
  parseSmtpPort,
  parseSmtpTlsMode,
  parseSmtpUsername,
} from "./validate.ts";

const EMPTY_ROW: ServerMailSettingsRow = {
  smtpHost: null,
  smtpPort: null,
  smtpTlsMode: null,
  smtpUsername: null,
  smtpPasswordCiphertext: null,
  emailFrom: null,
  publicAppUrl: null,
};

export class MailSettingsError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "MailSettingsError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type MailSettingsServiceDeps = {
  store: ServerMailSettingsStore;
  config: Pick<
    ApiConfig,
    | "sessionSecret"
    | "smtpHost"
    | "smtpPort"
    | "smtpSecure"
    | "smtpUser"
    | "smtpPassword"
    | "emailFrom"
    | "publicAppBaseUrl"
    | "emailProvider"
  >;
  users: {
    findById(id: string): Promise<{ email: string } | null>;
  };
  workspaces: {
    findById(id: string): Promise<{ ownerId: string } | null>;
    hasAccess(workspaceId: string, userId: string): Promise<boolean>;
  };
  logger?: Pick<Logger, "info" | "warn" | "error">;
  /** Test hook. Defaults to a one-off SMTP transport. */
  sendSmtp?: (snapshot: MailDeliverySnapshot, message: EmailMessage) => Promise<void>;
};

function validationError(code: string): MailSettingsError {
  switch (code) {
    case "INVALID_SMTP_HOST":
      return new MailSettingsError(code, 400, "smtp host must be a hostname");
    case "INVALID_SMTP_PORT":
      return new MailSettingsError(code, 400, "smtp port must be an integer from 1 to 65535");
    case "INVALID_SMTP_TLS_MODE":
      return new MailSettingsError(code, 400, "smtp tls mode must be none, starttls, or tls");
    case "INVALID_SMTP_USERNAME":
      return new MailSettingsError(code, 400, "smtp username is invalid");
    case "INVALID_EMAIL_FROM":
      return new MailSettingsError(code, 400, "sender address must be an email address");
    case "INVALID_PUBLIC_APP_URL":
      return new MailSettingsError(code, 400, "public app URL must be an absolute http or https URL");
    case "INVALID_SMTP_PASSWORD":
      return new MailSettingsError(code, 400, "smtp password is invalid");
    default:
      return new MailSettingsError("INVALID_MAIL_SETTINGS", 400, "mail settings are invalid");
  }
}

function envTlsMode(smtpSecure: boolean): SmtpTlsMode {
  return smtpSecure ? "tls" : "starttls";
}

function redactSecret(message: string, secret: string): string {
  if (!secret) {
    return message;
  }
  return message.split(secret).join("[redacted]");
}

export function toPublicMailSettings(snapshot: MailDeliverySnapshot): ServerMailSettingsPublic {
  return {
    smtpHost: snapshot.smtpHost,
    smtpPort: snapshot.smtpPort,
    smtpTlsMode: snapshot.smtpTlsMode,
    smtpUsername: snapshot.smtpUsername,
    emailFrom: snapshot.emailFrom,
    publicAppUrl: snapshot.publicAppBaseUrl,
    passwordSet: snapshot.passwordSet,
  };
}

export class MailSettingsService {
  private readonly store: ServerMailSettingsStore;
  private readonly config: MailSettingsServiceDeps["config"];
  private readonly users: MailSettingsServiceDeps["users"];
  private readonly workspaces: MailSettingsServiceDeps["workspaces"];
  private readonly logger?: MailSettingsServiceDeps["logger"];
  private readonly sendSmtp?: MailSettingsServiceDeps["sendSmtp"];

  constructor(deps: MailSettingsServiceDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.users = deps.users;
    this.workspaces = deps.workspaces;
    this.logger = deps.logger;
    this.sendSmtp = deps.sendSmtp;
  }

  async publicAppBaseUrl(): Promise<string> {
    return (await this.effective()).publicAppBaseUrl;
  }

  async effective(): Promise<MailDeliverySnapshot> {
    const row = (await this.store.read()) ?? EMPTY_ROW;
    const password = this.resolvePassword(row);
    const dbHost = row.smtpHost?.trim() || null;
    return {
      smtpHost: dbHost ?? this.config.smtpHost,
      smtpPort: row.smtpPort ?? this.config.smtpPort,
      smtpTlsMode: row.smtpTlsMode ?? envTlsMode(this.config.smtpSecure),
      smtpUsername: row.smtpUsername ?? this.config.smtpUser,
      smtpPassword: password,
      emailFrom: row.emailFrom?.trim() || this.config.emailFrom,
      publicAppBaseUrl: (row.publicAppUrl?.trim() || this.config.publicAppBaseUrl).replace(/\/$/, ""),
      passwordSet: password.length > 0,
      useSmtpTransport: this.config.emailProvider === "smtp" || Boolean(dbHost),
    };
  }

  async getForOwner(workspaceId: string, userId: string): Promise<ServerMailSettingsPublic> {
    await this.requireOwner(workspaceId, userId);
    return toPublicMailSettings(await this.effective());
  }

  async updateForOwner(
    workspaceId: string,
    userId: string,
    patch: ServerMailSettingsPatch,
  ): Promise<ServerMailSettingsPublic> {
    await this.requireOwner(workspaceId, userId);
    if (patch.password && patch.password.length > 0 && patch.clearPassword) {
      throw new MailSettingsError(
        "PASSWORD_CONFLICT",
        400,
        "set a password or clear it, not both",
      );
    }

    const current = (await this.store.read()) ?? { ...EMPTY_ROW };
    const next: ServerMailSettingsRow = { ...current };
    const changed: string[] = [];

    try {
      if (patch.smtpHost !== undefined) {
        next.smtpHost = parseSmtpHost(patch.smtpHost);
        changed.push("smtpHost");
      }
      if (patch.smtpPort !== undefined) {
        next.smtpPort = parseSmtpPort(patch.smtpPort);
        changed.push("smtpPort");
      }
      if (patch.smtpTlsMode !== undefined) {
        next.smtpTlsMode = parseSmtpTlsMode(patch.smtpTlsMode);
        changed.push("smtpTlsMode");
      }
      if (patch.smtpUsername !== undefined) {
        next.smtpUsername = parseSmtpUsername(patch.smtpUsername);
        changed.push("smtpUsername");
      }
      if (patch.emailFrom !== undefined) {
        next.emailFrom = parseEmailFrom(patch.emailFrom);
        changed.push("emailFrom");
      }
      if (patch.publicAppUrl !== undefined) {
        next.publicAppUrl = parsePublicAppUrl(patch.publicAppUrl);
        changed.push("publicAppUrl");
      }
      if (patch.clearPassword) {
        next.smtpPasswordCiphertext = null;
        changed.push("passwordCleared");
      } else if (patch.password !== undefined && patch.password.length > 0) {
        const password = parseSmtpPassword(patch.password);
        next.smtpPasswordCiphertext = this.sealPassword(password);
        changed.push("password");
      }
    } catch (error) {
      if (error instanceof MailSettingsError) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith("INVALID_")) {
        throw validationError(error.message);
      }
      throw error;
    }

    await this.store.write(next, userId);
    this.logger?.info("server mail settings updated", {
      workspaceId,
      userId,
      fields: changed,
    });
    return toPublicMailSettings(await this.effective());
  }

  async sendTestEmail(
    workspaceId: string,
    userId: string,
    patch: ServerMailSettingsPatch,
  ): Promise<void> {
    await this.requireOwner(workspaceId, userId);
    const user = await this.users.findById(userId);
    const to = user?.email?.trim() ?? "";
    if (!to) {
      throw new MailSettingsError("OWNER_EMAIL_MISSING", 400, "owner email is missing");
    }

    const saved = await this.effective();
    let snapshot: MailDeliverySnapshot;
    try {
      const host = patch.smtpHost !== undefined ? parseSmtpHost(patch.smtpHost) : saved.smtpHost;
      const port = patch.smtpPort !== undefined ? parseSmtpPort(patch.smtpPort) : saved.smtpPort;
      const tls =
        patch.smtpTlsMode !== undefined ? parseSmtpTlsMode(patch.smtpTlsMode) : saved.smtpTlsMode;
      const username =
        patch.smtpUsername !== undefined ? parseSmtpUsername(patch.smtpUsername) : saved.smtpUsername;
      const emailFrom =
        patch.emailFrom !== undefined ? parseEmailFrom(patch.emailFrom) : saved.emailFrom;
      const publicAppUrl =
        patch.publicAppUrl !== undefined
          ? parsePublicAppUrl(patch.publicAppUrl)
          : saved.publicAppBaseUrl;
      let password = saved.smtpPassword;
      if (patch.clearPassword) {
        password = this.config.smtpPassword;
      }
      if (patch.password !== undefined && patch.password.length > 0) {
        password = parseSmtpPassword(patch.password);
      }
      if (!host || port === null || !tls || !emailFrom) {
        throw new MailSettingsError(
          "SMTP_NOT_CONFIGURED",
          400,
          "smtp host, port, encryption, and sender address are required to send a test email",
        );
      }
      snapshot = {
        smtpHost: host,
        smtpPort: port,
        smtpTlsMode: tls,
        smtpUsername: username ?? "",
        smtpPassword: password,
        emailFrom,
        publicAppBaseUrl: publicAppUrl ?? "",
        passwordSet: password.length > 0,
        useSmtpTransport: true,
      };
    } catch (error) {
      if (error instanceof MailSettingsError) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith("INVALID_")) {
        throw validationError(error.message);
      }
      throw error;
    }

    const message: EmailMessage = {
      to,
      from: snapshot.emailFrom,
      subject: "Okkey SMTP test",
      text: snapshot.publicAppBaseUrl
        ? `This is a test message from your Okkey server.\nPublic app URL: ${snapshot.publicAppBaseUrl}\n`
        : "This is a test message from your Okkey server.\n",
      html: snapshot.publicAppBaseUrl
        ? `<p>This is a test message from your Okkey server.</p><p>Public app URL: ${escapeHtml(snapshot.publicAppBaseUrl)}</p>`
        : "<p>This is a test message from your Okkey server.</p>",
    };

    try {
      if (this.sendSmtp) {
        await this.sendSmtp(snapshot, message);
      } else {
        const sender = await SmtpEmailSender.fromSnapshot(snapshot);
        await sender.send(message);
      }
    } catch (error) {
      const cause =
        error &&
        typeof error === "object" &&
        "details" in error &&
        typeof (error as { details?: { cause?: unknown } }).details?.cause === "string"
          ? (error as { details: { cause: string } }).details.cause
          : error instanceof Error
            ? error.message
            : "smtp send failed";
      const messageText = redactSecret(cause, snapshot.smtpPassword).slice(0, 500);
      this.logger?.warn("server mail test email failed", { workspaceId, userId });
      throw new MailSettingsError("EMAIL_TRANSPORT_ERROR", 502, messageText);
    }
  }

  private async requireOwner(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new MailSettingsError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess || workspace.ownerId !== userId) {
      throw new MailSettingsError("ACCESS_DENIED", 403, "only the workspace owner can change server mail settings");
    }
  }

  private resolvePassword(row: ServerMailSettingsRow): string {
    if (!row.smtpPasswordCiphertext) {
      return this.config.smtpPassword;
    }
    const key = deriveSmtpPasswordKey(this.config.sessionSecret);
    try {
      const plain = openSecret(key, row.smtpPasswordCiphertext);
      try {
        return plain.toString("utf8");
      } finally {
        wipeSecretBytes(plain);
      }
    } catch (error) {
      this.logger?.error("stored smtp password could not be decrypted", {
        message: error instanceof Error ? error.message : "decrypt failed",
      });
      throw new MailSettingsError(
        "SMTP_PASSWORD_UNAVAILABLE",
        500,
        "stored smtp password could not be decrypted",
      );
    } finally {
      wipeSecretBytes(key);
    }
  }

  private sealPassword(password: string): Buffer {
    const key = deriveSmtpPasswordKey(this.config.sessionSecret);
    const plain = Buffer.from(password, "utf8");
    try {
      return sealSecret(key, plain);
    } finally {
      wipeSecretBytes(key);
      wipeSecretBytes(plain);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
