import type { ApiConfig } from "../config.ts";
import { deriveSmtpPasswordKey, openSecret, sealSecret } from "../crypto/server-aes.ts";
import { wipeSecretBytes } from "../crypto/secret-lifecycle.ts";
import type { EmailMessage } from "../email/service.ts";
import {
  SMTP_TEST_CONNECTION_TIMEOUT_MS,
  SmtpEmailSender,
} from "../email/service.ts";
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

const ENV_SEED_UPDATED_BY = "system:env-seed";

/** Bound for the one-time upgrade check so startup does not wait on a dead host. */
export const SMTP_LEGACY_PROBE_TIMEOUT_MS = 10_000;

const EMPTY_ROW: ServerMailSettingsRow = {
  smtpHost: null,
  smtpPort: null,
  smtpTlsMode: null,
  smtpUsername: null,
  smtpPasswordCiphertext: null,
  emailFrom: null,
  publicAppUrl: null,
  smtpVerifiedAt: null,
  smtpLegacyProbedAt: null,
  updatedBy: null,
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

function positiveTimeout(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function smtpTestTimeoutMessage(timeoutMs: number): string {
  return `SMTP connection timed out after ${Math.max(1, Math.ceil(timeoutMs / 1000))}s`;
}

async function raceWithTimeout<T>(
  action: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try {
            onTimeout();
          } catch {
            /* ignore */
          }
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

export type MailSettingsAccessAction = "get" | "put";

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
    | "deploymentMode"
  >;
  users: {
    findById(id: string): Promise<{ email: string } | null>;
  };
  workspaces: {
    findById(id: string): Promise<{ ownerId: string } | null>;
    hasAccess(workspaceId: string, userId: string): Promise<boolean>;
  };
  assertPermission?: (
    workspaceId: string,
    userId: string,
    action: MailSettingsAccessAction,
  ) => Promise<void>;
  logger?: Pick<Logger, "info" | "warn" | "error">;
  sendSmtp?: (snapshot: MailDeliverySnapshot, message: EmailMessage) => Promise<void>;
  /** Connect and authenticate. Must not send a message. */
  verifySmtp?: (snapshot: MailDeliverySnapshot) => Promise<void>;
  smtpTestTimeoutMs?: number;
  /** Bound for the one-time upgrade SMTP check. Defaults to 10s. */
  legacyProbeTimeoutMs?: number;
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

type PasswordResolution = {
  password: string;
  unreadable: boolean;
};

export function toPublicMailSettingsFromRow(
  row: ServerMailSettingsRow,
  resolved: PasswordResolution,
): ServerMailSettingsPublic {
  const hasStoredPassword = Boolean(row.smtpPasswordCiphertext);
  const host = row.smtpHost?.trim() ?? "";
  const smtpActive = Boolean(row.smtpVerifiedAt && host);
  return {
    smtpHost: host,
    smtpPort: row.smtpPort,
    smtpTlsMode: row.smtpTlsMode,
    smtpUsername: row.smtpUsername ?? "",
    emailFrom: row.emailFrom ?? "",
    publicAppUrl: row.publicAppUrl ?? "",
    passwordSet: hasStoredPassword && !resolved.unreadable,
    passwordUnreadable: resolved.unreadable,
    smtpActive,
    smtpVerifiedAt: row.smtpVerifiedAt,
  };
}

export class MailSettingsService {
  private readonly store: ServerMailSettingsStore;
  private readonly config: MailSettingsServiceDeps["config"];
  private readonly users: MailSettingsServiceDeps["users"];
  private readonly workspaces: MailSettingsServiceDeps["workspaces"];
  private readonly assertPermission?: MailSettingsServiceDeps["assertPermission"];
  private readonly logger?: MailSettingsServiceDeps["logger"];
  private readonly sendSmtp?: MailSettingsServiceDeps["sendSmtp"];
  private readonly verifySmtp?: MailSettingsServiceDeps["verifySmtp"];
  private readonly smtpTestTimeoutMs: number;
  private readonly legacyProbeTimeoutMs: number;
  private unreadableWarned = false;
  private seedPromise: Promise<ServerMailSettingsRow> | null = null;

  constructor(deps: MailSettingsServiceDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.users = deps.users;
    this.workspaces = deps.workspaces;
    this.assertPermission = deps.assertPermission;
    this.logger = deps.logger;
    this.sendSmtp = deps.sendSmtp;
    this.verifySmtp = deps.verifySmtp;
    this.legacyProbeTimeoutMs = positiveTimeout(
      deps.legacyProbeTimeoutMs,
      SMTP_LEGACY_PROBE_TIMEOUT_MS,
    );
    this.smtpTestTimeoutMs = positiveTimeout(
      deps.smtpTestTimeoutMs,
      SMTP_TEST_CONNECTION_TIMEOUT_MS,
    );
  }

  /**
   * Settings saved before SMTP had to be verified have no `smtp_verified_at`.
   * On startup, connect and authenticate once. A passing check activates mail.
   * A failing check leaves mail inactive. Form saves and env seed are not probed.
   */
  async probeLegacySmtpOnce(): Promise<void> {
    if (this.config.deploymentMode !== "self_hosted") {
      return;
    }
    await this.ensureSeeded();
    const probedAt = new Date().toISOString();
    const claimed = await this.store.claimLegacySmtpProbe(probedAt);
    if (!claimed?.smtpHost) {
      return;
    }
    const resolved = this.resolvePassword(claimed);
    if (resolved.unreadable) {
      this.logger?.warn("legacy smtp check skipped");
      return;
    }
    const snapshot = this.snapshotFromRow(claimed, resolved, { forceTransport: true });
    try {
      await this.verifyLegacyConnection(snapshot);
    } catch {
      this.logger?.warn("legacy smtp check failed");
      return;
    }
    const activated = await this.store.markLegacySmtpVerified({
      verifiedAt: new Date().toISOString(),
      probedAt,
      smtpHost: claimed.smtpHost,
    });
    if (activated) {
      this.logger?.info("legacy smtp settings verified");
    }
  }

  async publicAppBaseUrl(): Promise<string> {
    return (await this.effective()).publicAppBaseUrl;
  }

  /** Outbound OTP / system mail is active only after a successful SMTP test. */
  async isOutboundActive(): Promise<boolean> {
    const row = await this.ensureSeeded();
    return Boolean(row.smtpVerifiedAt && row.smtpHost?.trim());
  }

  async effective(): Promise<MailDeliverySnapshot> {
    const row = await this.ensureSeeded();
    return this.snapshotFromRow(row, this.resolvePassword(row));
  }

  async getForOwner(workspaceId: string, userId: string): Promise<ServerMailSettingsPublic> {
    await this.requireAccess(workspaceId, userId, "get");
    return this.publicSettings();
  }

  /**
   * Persist form values and mark SMTP inactive (e.g. "Save anyway" after a failed test).
   */
  async updateForOwner(
    workspaceId: string,
    userId: string,
    patch: ServerMailSettingsPatch,
  ): Promise<ServerMailSettingsPublic> {
    await this.requireAccess(workspaceId, userId, "put");
    const current = await this.ensureSeeded();
    const next = this.applyPatch(current, patch);
    next.smtpVerifiedAt = null;
    next.smtpLegacyProbedAt = new Date().toISOString();
    next.updatedBy = userId;
    await this.store.write(next, userId);
    this.logger?.info("server mail settings saved inactive", {
      workspaceId,
      userId,
    });
    return toPublicMailSettingsFromRow(next, this.resolvePassword(next));
  }

  /**
   * Send a test message with the form values. On success, persist settings and mark SMTP active.
   */
  async sendTestEmail(
    workspaceId: string,
    userId: string,
    patch: ServerMailSettingsPatch,
  ): Promise<ServerMailSettingsPublic> {
    await this.requireAccess(workspaceId, userId, "put");
    const user = await this.users.findById(userId);
    const to = user?.email?.trim() ?? "";
    if (!to) {
      throw new MailSettingsError("OWNER_EMAIL_MISSING", 400, "owner email is missing");
    }

    const current = await this.ensureSeeded();
    const next = this.applyPatch(current, patch);
    const resolved = this.resolvePassword(next);
    if (resolved.unreadable && !patch.clearPassword && !(patch.password && patch.password.length > 0)) {
      throw new MailSettingsError(
        "SMTP_PASSWORD_UNAVAILABLE",
        409,
        "stored smtp password could not be decrypted",
      );
    }

    const snapshot = this.snapshotFromRow(next, resolved, { forceTransport: true });
    if (!snapshot.smtpHost.trim() || !snapshot.emailFrom.trim()) {
      throw new MailSettingsError(
        "SMTP_NOT_CONFIGURED",
        400,
        "smtp host, port, encryption, and sender address are required to send a test email",
      );
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
      await this.dispatchSmtp(snapshot, message);
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

    next.smtpVerifiedAt = new Date().toISOString();
    next.smtpLegacyProbedAt = next.smtpLegacyProbedAt ?? next.smtpVerifiedAt;
    next.updatedBy = userId;
    await this.store.write(next, userId);
    this.logger?.info("server mail settings verified", { workspaceId, userId });
    return toPublicMailSettingsFromRow(next, this.resolvePassword(next));
  }

  private async verifyLegacyConnection(snapshot: MailDeliverySnapshot): Promise<void> {
    const timeoutMs = this.legacyProbeTimeoutMs;
    const timeoutMessage = smtpTestTimeoutMessage(timeoutMs);
    if (this.verifySmtp) {
      const pending = this.verifySmtp(snapshot);
      try {
        await raceWithTimeout(pending, timeoutMs, () => undefined, timeoutMessage);
      } catch (error) {
        void pending.catch(() => undefined);
        throw error;
      }
      return;
    }
    const sender = await SmtpEmailSender.fromSnapshot(snapshot, {
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });
    const pending = sender.verifyConnection();
    try {
      await raceWithTimeout(pending, timeoutMs, () => sender.close(), timeoutMessage);
    } catch (error) {
      sender.close();
      void pending.catch(() => undefined);
      throw error;
    }
  }

  private async dispatchSmtp(snapshot: MailDeliverySnapshot, message: EmailMessage): Promise<void> {
    const timeoutMs = this.smtpTestTimeoutMs;
    const timeoutMessage = smtpTestTimeoutMessage(timeoutMs);
    if (this.sendSmtp) {
      const sendPromise = this.sendSmtp(snapshot, message);
      try {
        await raceWithTimeout(sendPromise, timeoutMs, () => undefined, timeoutMessage);
      } catch (error) {
        void sendPromise.catch(() => undefined);
        throw error;
      }
      return;
    }
    const sender = await SmtpEmailSender.fromSnapshot(snapshot, {
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });
    const sendPromise = sender.send(message);
    try {
      await raceWithTimeout(sendPromise, timeoutMs, () => sender.close(), timeoutMessage);
    } catch (error) {
      sender.close();
      void sendPromise.catch(() => undefined);
      throw error;
    }
  }

  private applyPatch(current: ServerMailSettingsRow, patch: ServerMailSettingsPatch): ServerMailSettingsRow {
    if (patch.password && patch.password.length > 0 && patch.clearPassword) {
      throw new MailSettingsError(
        "PASSWORD_CONFLICT",
        400,
        "set a password or clear it, not both",
      );
    }
    const next: ServerMailSettingsRow = { ...current };
    try {
      if (patch.smtpHost !== undefined) {
        next.smtpHost = parseSmtpHost(patch.smtpHost);
      }
      if (patch.smtpPort !== undefined) {
        next.smtpPort = parseSmtpPort(patch.smtpPort);
      }
      if (patch.smtpTlsMode !== undefined) {
        next.smtpTlsMode = parseSmtpTlsMode(patch.smtpTlsMode);
      }
      if (patch.smtpUsername !== undefined) {
        next.smtpUsername = parseSmtpUsername(patch.smtpUsername);
      }
      if (patch.emailFrom !== undefined) {
        next.emailFrom = parseEmailFrom(patch.emailFrom);
      }
      if (patch.publicAppUrl !== undefined) {
        next.publicAppUrl = parsePublicAppUrl(patch.publicAppUrl);
      }
      if (patch.clearPassword) {
        next.smtpPasswordCiphertext = null;
      } else if (patch.password !== undefined && patch.password.length > 0) {
        next.smtpPasswordCiphertext = this.sealPassword(parseSmtpPassword(patch.password));
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
    return next;
  }

  private async requireAccess(
    workspaceId: string,
    userId: string,
    action: MailSettingsAccessAction,
  ): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new MailSettingsError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new MailSettingsError("ACCESS_DENIED", 403, "access denied");
    }
    if (this.assertPermission) {
      try {
        await this.assertPermission(workspaceId, userId, action);
      } catch (error) {
        if (error instanceof MailSettingsError) {
          throw error;
        }
        throw new MailSettingsError("ACCESS_DENIED", 403, "access denied");
      }
      return;
    }
    if (workspace.ownerId !== userId) {
      throw new MailSettingsError("ACCESS_DENIED", 403, "access denied");
    }
  }

  private async publicSettings(): Promise<ServerMailSettingsPublic> {
    const row = await this.ensureSeeded();
    return toPublicMailSettingsFromRow(row, this.resolvePassword(row));
  }

  /**
   * One-time copy of EMAIL_* into the singleton row when `updated_by` is still null.
   * After that, cleared fields stay empty (no further env merge).
   */
  private async ensureSeeded(): Promise<ServerMailSettingsRow> {
    if (!this.seedPromise) {
      this.seedPromise = this.seedFromEnvIfNeeded().finally(() => {
        this.seedPromise = null;
      });
    }
    return this.seedPromise;
  }

  private async seedFromEnvIfNeeded(): Promise<ServerMailSettingsRow> {
    const existing = (await this.store.read()) ?? { ...EMPTY_ROW };
    if (existing.updatedBy != null) {
      return existing;
    }
    const seeded: ServerMailSettingsRow = {
      smtpHost: this.config.smtpHost.trim() || null,
      smtpPort: this.config.smtpPort,
      smtpTlsMode: envTlsMode(this.config.smtpSecure),
      smtpUsername: this.config.smtpUser.trim() || null,
      smtpPasswordCiphertext: this.config.smtpPassword
        ? this.sealPassword(this.config.smtpPassword)
        : null,
      emailFrom: this.config.emailFrom.trim() || null,
      publicAppUrl: this.config.publicAppBaseUrl.trim().replace(/\/$/, "") || null,
      smtpVerifiedAt: null,
      smtpLegacyProbedAt: new Date().toISOString(),
      updatedBy: ENV_SEED_UPDATED_BY,
    };
    await this.store.write(seeded, ENV_SEED_UPDATED_BY);
    this.logger?.info("server mail settings seeded from environment");
    return seeded;
  }

  private async loadRow(): Promise<ServerMailSettingsRow> {
    return this.ensureSeeded();
  }

  private snapshotFromRow(
    row: ServerMailSettingsRow,
    resolved: PasswordResolution,
    options?: { forceTransport?: boolean },
  ): MailDeliverySnapshot {
    const host = row.smtpHost?.trim() ?? "";
    const active = Boolean(row.smtpVerifiedAt && host);
    return {
      smtpHost: host,
      smtpPort: row.smtpPort ?? 587,
      smtpTlsMode: row.smtpTlsMode ?? "starttls",
      smtpUsername: row.smtpUsername ?? "",
      smtpPassword: resolved.password,
      emailFrom: row.emailFrom?.trim() ?? "",
      publicAppBaseUrl: (row.publicAppUrl?.trim() ?? "").replace(/\/$/, ""),
      passwordSet: Boolean(row.smtpPasswordCiphertext) && !resolved.unreadable,
      passwordUnreadable: resolved.unreadable,
      useSmtpTransport: options?.forceTransport ? Boolean(host) : active,
    };
  }

  private resolvePassword(row: ServerMailSettingsRow): PasswordResolution {
    if (!row.smtpPasswordCiphertext) {
      this.unreadableWarned = false;
      return { password: "", unreadable: false };
    }
    const key = deriveSmtpPasswordKey(this.config.sessionSecret);
    try {
      const plain = openSecret(key, row.smtpPasswordCiphertext);
      try {
        this.unreadableWarned = false;
        return { password: plain.toString("utf8"), unreadable: false };
      } finally {
        wipeSecretBytes(plain);
      }
    } catch (error) {
      this.warnUnreadable(error);
      return { password: "", unreadable: true };
    } finally {
      wipeSecretBytes(key);
    }
  }

  private warnUnreadable(error: unknown): void {
    if (this.unreadableWarned) {
      return;
    }
    this.unreadableWarned = true;
    const raw = error instanceof Error ? error.message : "decrypt failed";
    const reason = redactSecret(redactSecret(raw, this.config.smtpPassword), this.config.sessionSecret).slice(
      0,
      200,
    );
    this.logger?.warn("stored smtp password could not be decrypted", { reason });
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
