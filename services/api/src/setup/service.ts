import { createHash, randomBytes } from "node:crypto";
import type { ApiConfig } from "../config.ts";
import type { AuthService } from "../auth/service.ts";
import { AuthError } from "../auth/service.ts";
import { generateEntityId } from "../entity-id.ts";
import type { Logger } from "../logger.ts";
import type { MailSettingsService } from "../mail-settings/service.ts";
import type { ServerMailSettingsPatch, ServerMailSettingsPublic } from "../mail-settings/types.ts";
import { parsePublicAppUrl } from "../mail-settings/validate.ts";
import type { SessionService } from "../session/service.ts";
import type { UsersRepository } from "../storage/repositories.ts";
import type { WorkspaceMembersService } from "../workspace-members/service.ts";
import type { WorkspaceSettingsService } from "../workspace-settings/service.ts";
import { DEFAULT_WORKSPACE_TILE_COLOR } from "../workspace-settings/service.ts";
import {
  generateSetupCodePlaintext,
  hashSetupCode,
  normalizeSetupCode,
  setupCodeHashesEqual,
} from "./codes.ts";
import { SMTP_PROVIDER_TEMPLATES } from "./smtp-providers.ts";
import type {
  RegistrationMode,
  ServerInstanceSettingsStore,
  SetupBeginRegistrationResult,
  SetupFinishInput,
  SetupFinishResult,
  SetupSessionPayload,
  SetupStatusResponse,
  SetupVerifyResponse,
} from "./types.ts";

const SETUP_CODE_HASH_KEY = "setup:code:hash";
const SETUP_CODE_ATTEMPTS_KEY = "setup:code:attempts";
const SETUP_SESSION_PREFIX = "setup:session:";

/** Default: 7 days for the printed one-time setup code. */
export const DEFAULT_SETUP_CODE_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Failed verify attempts before the code is locked out. */
export const DEFAULT_SETUP_CODE_MAX_ATTEMPTS = 10;

const SETUP_ACTOR = "system:setup";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeTileColor(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value);
  if (!match) {
    return DEFAULT_WORKSPACE_TILE_COLOR.toLowerCase();
  }
  const hex = match[1]!;
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
}

function sanitizeWorkspaceName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > 120) {
    throw new SetupError("INVALID_WORKSPACE_NAME", 400, "workspace name is invalid");
  }
  return name;
}

export class SetupError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "SetupError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type SetupServiceDeps = {
  redis: {
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    setIfNotExistsWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
  };
  users: Pick<UsersRepository, "hasAnyUsers" | "findByEmail">;
  instanceSettings: ServerInstanceSettingsStore;
  mailSettings: Pick<
    MailSettingsService,
    | "getPublicSettings"
    | "updateForSetup"
    | "sendTestEmailForSetup"
    | "skipMailForSetup"
    | "updatePublicAppUrlPreservingVerification"
  >;
  authService: Pick<
    AuthService,
    "claimEmptyCatalogBootstrap" | "createRegistrationAuthStateForTrustedEmail"
  >;
  sessionService: Pick<SessionService, "createSession">;
  workspaceSettings: Pick<WorkspaceSettingsService, "updateSettings">;
  workspaceMembers: Pick<WorkspaceMembersService, "createInvitations" | "hasPendingInvitationForEmail">;
  postgres: {
    query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): Promise<T[]>;
  };
  config: Pick<
    ApiConfig,
    | "deploymentMode"
    | "nodeEnv"
    | "registrationAuthStateTtlSeconds"
    | "sessionTtlSeconds"
  > & {
    setupCodeTtlSeconds?: number;
    setupCodeMaxAttempts?: number;
    /** Optional pre-shared plaintext (install / e2e). Never logged. */
    setupCodePlaintext?: string;
    /** Optional SHA-256 hex from install.sh (`OKKEY_SETUP_CODE_HASH`). */
    setupCodeHash?: string;
  };
  logger?: Logger;
  now?: () => Date;
  generateSetupCode?: () => string;
  generateSessionId?: () => string;
};

export class SetupService {
  private readonly redis: SetupServiceDeps["redis"];
  private readonly users: SetupServiceDeps["users"];
  private readonly instanceSettings: ServerInstanceSettingsStore;
  private readonly mailSettings: SetupServiceDeps["mailSettings"];
  private readonly authService: SetupServiceDeps["authService"];
  private readonly sessionService: SetupServiceDeps["sessionService"];
  private readonly workspaceSettings: SetupServiceDeps["workspaceSettings"];
  private readonly workspaceMembers: SetupServiceDeps["workspaceMembers"];
  private readonly postgres: SetupServiceDeps["postgres"];
  private readonly config: SetupServiceDeps["config"];
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly generateSetupCode: () => string;
  private readonly generateSessionId: () => string;

  constructor(deps: SetupServiceDeps) {
    this.redis = deps.redis;
    this.users = deps.users;
    this.instanceSettings = deps.instanceSettings;
    this.mailSettings = deps.mailSettings;
    this.authService = deps.authService;
    this.sessionService = deps.sessionService;
    this.workspaceSettings = deps.workspaceSettings;
    this.workspaceMembers = deps.workspaceMembers;
    this.postgres = deps.postgres;
    this.config = deps.config;
    this.logger = deps.logger;
    this.now = deps.now ?? (() => new Date());
    this.generateSetupCode = deps.generateSetupCode ?? generateSetupCodePlaintext;
    this.generateSessionId = deps.generateSessionId ?? (() => randomBytes(24).toString("hex"));
  }

  private codeTtlSeconds(): number {
    return this.config.setupCodeTtlSeconds ?? DEFAULT_SETUP_CODE_TTL_SECONDS;
  }

  private maxAttempts(): number {
    return this.config.setupCodeMaxAttempts ?? DEFAULT_SETUP_CODE_MAX_ATTEMPTS;
  }

  private sessionKey(id: string): string {
    return `${SETUP_SESSION_PREFIX}${id}`;
  }

  /**
   * On self-host boot with an empty catalog: ensure a hashed setup code exists in Redis
   * and log the plaintext once when this process minted it.
   */
  async ensureBootstrapCode(): Promise<void> {
    if (this.config.deploymentMode !== "self_hosted") {
      return;
    }
    if (await this.users.hasAnyUsers()) {
      await this.clearSetupCodeState();
      return;
    }
    const existing = await this.redis.get(SETUP_CODE_HASH_KEY);
    if (existing) {
      this.logger?.info("self-host setup required", {
        event: "setup_code_ready",
        hint: "enter the one-time setup code from install output or earlier API logs",
      });
      return;
    }

    const fromEnvHash = this.config.setupCodeHash?.trim().toLowerCase() ?? "";
    const fromEnvPlain = this.config.setupCodePlaintext?.trim() ?? "";
    let hash: string;
    let mintedPlain: string | null = null;

    if (/^[0-9a-f]{64}$/.test(fromEnvHash)) {
      hash = fromEnvHash;
    } else if (fromEnvPlain) {
      hash = hashSetupCode(fromEnvPlain);
    } else {
      mintedPlain = this.generateSetupCode();
      hash = hashSetupCode(mintedPlain);
    }

    const created = await this.redis.setIfNotExistsWithTtl(SETUP_CODE_HASH_KEY, hash, this.codeTtlSeconds());
    if (!created) {
      this.logger?.info("self-host setup required", {
        event: "setup_code_ready",
        hint: "enter the one-time setup code from install output or earlier API logs",
      });
      return;
    }
    await this.redis.setWithTtl(SETUP_CODE_ATTEMPTS_KEY, "0", this.codeTtlSeconds());

    if (mintedPlain) {
      // Plaintext is logged once so operators can complete first-run without mail.
      this.logger?.info("self-host setup code minted", {
        event: "setup_code_minted",
        setup_code: mintedPlain,
        expires_in_seconds: this.codeTtlSeconds(),
      });
    } else {
      this.logger?.info("self-host setup code loaded from environment", {
        event: "setup_code_loaded",
        expires_in_seconds: this.codeTtlSeconds(),
      });
    }
  }

  async getStatus(): Promise<SetupStatusResponse> {
    const deploymentMode = this.config.deploymentMode;
    if (deploymentMode !== "self_hosted") {
      return { required: false, deploymentMode };
    }
    if (await this.users.hasAnyUsers()) {
      return { required: false, deploymentMode };
    }
    const hash = await this.redis.get(SETUP_CODE_HASH_KEY);
    return { required: Boolean(hash), deploymentMode };
  }

  async verifyCode(rawCode: string): Promise<SetupVerifyResponse> {
    if (this.config.deploymentMode !== "self_hosted") {
      throw new SetupError("SETUP_NOT_AVAILABLE", 404, "setup is not available");
    }
    if (await this.users.hasAnyUsers()) {
      throw new SetupError("SETUP_NOT_REQUIRED", 409, "setup is already complete");
    }

    const storedHash = await this.redis.get(SETUP_CODE_HASH_KEY);
    if (!storedHash) {
      throw new SetupError("SETUP_CODE_MISSING", 404, "setup code is not available");
    }

    const attemptsRaw = await this.redis.get(SETUP_CODE_ATTEMPTS_KEY);
    const attempts = Number(attemptsRaw ?? "0");
    if (Number.isFinite(attempts) && attempts >= this.maxAttempts()) {
      throw new SetupError("SETUP_CODE_LOCKED", 429, "too many setup code attempts");
    }

    const normalized = normalizeSetupCode(rawCode);
    if (!normalized) {
      await this.bumpAttempts();
      throw new SetupError("SETUP_CODE_INVALID", 401, "invalid setup code");
    }

    const candidateHash = hashSetupCode(normalized);
    if (!setupCodeHashesEqual(storedHash, candidateHash)) {
      const next = await this.bumpAttempts();
      if (next >= this.maxAttempts()) {
        throw new SetupError("SETUP_CODE_LOCKED", 429, "too many setup code attempts");
      }
      throw new SetupError("SETUP_CODE_INVALID", 401, "invalid setup code");
    }

    // Successful verify resets the attempt counter but does not consume the code.
    await this.redis.setWithTtl(SETUP_CODE_ATTEMPTS_KEY, "0", this.codeTtlSeconds());

    const sessionId = this.generateSessionId();
    const now = this.now();
    const ttl = this.config.registrationAuthStateTtlSeconds;
    const payload: SetupSessionPayload = {
      id: sessionId,
      createdAt: now.toISOString(),
    };
    await this.redis.setWithTtl(this.sessionKey(sessionId), JSON.stringify(payload), ttl);
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
    return { setupToken: sessionId, expiresAt };
  }

  async requireSession(token: string | null | undefined): Promise<SetupSessionPayload> {
    const id = token?.trim() ?? "";
    if (!id) {
      throw new SetupError("SETUP_AUTH_REQUIRED", 401, "setup session required");
    }
    if (this.config.deploymentMode !== "self_hosted") {
      throw new SetupError("SETUP_NOT_AVAILABLE", 404, "setup is not available");
    }
    if (await this.users.hasAnyUsers()) {
      throw new SetupError("SETUP_NOT_REQUIRED", 409, "setup is already complete");
    }
    const raw = await this.redis.get(this.sessionKey(id));
    if (!raw) {
      throw new SetupError("SETUP_AUTH_REQUIRED", 401, "setup session required");
    }
    try {
      return JSON.parse(raw) as SetupSessionPayload;
    } catch {
      throw new SetupError("SETUP_AUTH_REQUIRED", 401, "setup session required");
    }
  }

  private async saveSession(session: SetupSessionPayload): Promise<void> {
    const ttl = this.config.registrationAuthStateTtlSeconds;
    await this.redis.setWithTtl(this.sessionKey(session.id), JSON.stringify(session), ttl);
  }

  listSmtpProviderTemplates() {
    return SMTP_PROVIDER_TEMPLATES.map((t) => ({
      id: t.id,
      smtp_host: t.smtpHost,
      smtp_port: t.smtpPort,
      smtp_tls_mode: t.smtpTlsMode,
      username_hint: t.usernameHint ?? null,
    }));
  }

  async getMailSettings(token: string): Promise<ServerMailSettingsPublic> {
    await this.requireSession(token);
    return this.mailSettings.getPublicSettings();
  }

  async updateMailSettings(
    token: string,
    patch: ServerMailSettingsPatch,
  ): Promise<ServerMailSettingsPublic> {
    await this.requireSession(token);
    return this.mailSettings.updateForSetup(patch, SETUP_ACTOR);
  }

  async sendTestEmail(
    token: string,
    patch: ServerMailSettingsPatch,
    recipientEmail: string,
  ): Promise<ServerMailSettingsPublic> {
    await this.requireSession(token);
    const to = normalizeEmail(recipientEmail);
    if (!isValidEmail(to)) {
      throw new SetupError("INVALID_EMAIL", 400, "invalid email");
    }
    return this.mailSettings.sendTestEmailForSetup(patch, to, SETUP_ACTOR);
  }

  async skipMail(token: string): Promise<ServerMailSettingsPublic> {
    const session = await this.requireSession(token);
    session.mailSkipped = true;
    await this.saveSession(session);
    return this.mailSettings.skipMailForSetup(SETUP_ACTOR);
  }

  async updateInstance(
    token: string,
    input: { publicAppUrl?: string; registrationMode?: RegistrationMode },
  ): Promise<{ publicAppUrl: string; registrationMode: RegistrationMode }> {
    const session = await this.requireSession(token);
    let publicAppUrl = "";
    if (input.publicAppUrl !== undefined) {
      try {
        publicAppUrl = parsePublicAppUrl(input.publicAppUrl) ?? "";
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid public app url";
        throw new SetupError("INVALID_PUBLIC_APP_URL", 400, message);
      }
      await this.mailSettings.updatePublicAppUrlPreservingVerification(
        publicAppUrl,
        SETUP_ACTOR,
      );
    } else {
      const mail = await this.mailSettings.getPublicSettings();
      publicAppUrl = mail.publicAppUrl;
    }

    let registrationMode: RegistrationMode = "open";
    if (input.registrationMode !== undefined) {
      if (input.registrationMode !== "open" && input.registrationMode !== "invite_only") {
        throw new SetupError("INVALID_REGISTRATION_MODE", 400, "invalid registration mode");
      }
      registrationMode = input.registrationMode;
      await this.instanceSettings.writeRegistrationMode(registrationMode);
      session.registrationMode = registrationMode;
      await this.saveSession(session);
    } else {
      registrationMode = (await this.instanceSettings.read()).registrationMode;
    }

    return { publicAppUrl, registrationMode };
  }

  async getInstance(token: string): Promise<{ publicAppUrl: string; registrationMode: RegistrationMode }> {
    await this.requireSession(token);
    const mail = await this.mailSettings.getPublicSettings();
    const instance = await this.instanceSettings.read();
    return {
      publicAppUrl: mail.publicAppUrl,
      registrationMode: instance.registrationMode,
    };
  }

  /**
   * Exclusive empty-catalog claim + registration auth state for the owner email.
   * Replaces the old email-start bootstrap path.
   */
  async beginRegistration(
    token: string,
    emailRaw: string,
  ): Promise<SetupBeginRegistrationResult> {
    const session = await this.requireSession(token);
    const email = normalizeEmail(emailRaw);
    if (!isValidEmail(email)) {
      throw new SetupError("INVALID_EMAIL", 400, "invalid email");
    }

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new SetupError("EMAIL_TAKEN", 409, "email already registered");
    }

    const claimed = await this.authService.claimEmptyCatalogBootstrap(email);
    if (!claimed) {
      throw new SetupError("SETUP_CLAIM_HELD", 409, "another first registration is in progress");
    }

    const authStateId = await this.authService.createRegistrationAuthStateForTrustedEmail(email);
    session.ownerEmail = email;
    session.authStateId = authStateId;
    await this.saveSession(session);

    const expiresAt = new Date(
      this.now().getTime() + this.config.registrationAuthStateTtlSeconds * 1000,
    ).toISOString();
    return { authStateId, email, expiresAt };
  }

  /**
   * After register/complete + recovery enroll/ack: mint a full device-bound session,
   * apply workspace branding + invites, consume the setup code, and mark setup complete.
   * Uses the registration result cache (auth state id on the setup session) — the
   * short-lived registration_recovery bearer may already be revoked by export ack.
   */
  async finish(token: string, input: SetupFinishInput): Promise<SetupFinishResult> {
    const session = await this.requireSession(token);
    if (!session.authStateId || !session.ownerEmail) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }

    const { registrationResultRedisKey } = await import("../registration/service.ts");
    const cachedRaw = await this.redis.get(registrationResultRedisKey(session.authStateId));
    if (!cachedRaw) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }
    let cached: {
      userId: string;
      workspaceId: string;
      vaultId: string;
      deviceId: string;
    };
    try {
      cached = JSON.parse(cachedRaw) as typeof cached;
    } catch {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }
    if (!cached.userId || !cached.workspaceId || !cached.vaultId || !cached.deviceId) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }

    const recoveryRows = await this.postgres.query<{ exported_at: string | Date | null }>(
      `
        SELECT exported_at
        FROM user_vault_recovery_wrap
        WHERE user_id = $1
        LIMIT 1
      `,
      [cached.userId],
    );
    if (!recoveryRows[0]?.exported_at) {
      throw new SetupError(
        "SETUP_RECOVERY_REQUIRED",
        409,
        "save the recovery key before finishing setup",
      );
    }

    const workspaceName = sanitizeWorkspaceName(input.workspaceName);
    const tileColor = sanitizeTileColor(input.tileColor);

    await this.workspaceSettings.updateSettings(cached.workspaceId, cached.userId, {
      name: workspaceName,
      tileColor,
    });

    if (input.dismissPersonalDataBootstrap !== false) {
      await this.dismissPersonalDataBootstrap(cached.workspaceId, cached.userId);
    }

    const invitations = input.invitations ?? [];
    if (invitations.length > 0) {
      const roleRows = await this.postgres.query<{ id: string; builtin_id: string | null }>(
        `
          SELECT id, builtin_id
          FROM workspace_roles
          WHERE workspace_id = $1 AND builtin_id IN ('admin', 'user')
        `,
        [cached.workspaceId],
      );
      const roleByBuiltin = new Map(
        roleRows.map((r) => [String(r.builtin_id), String(r.id)] as const),
      );
      const batch: Array<{ email: string; roleId: string }> = [];
      for (const invite of invitations) {
        const email = normalizeEmail(invite.email);
        if (!isValidEmail(email)) {
          continue;
        }
        if (session.ownerEmail && email === session.ownerEmail) {
          continue;
        }
        const builtin = invite.roleBuiltinId === "admin" ? "admin" : "user";
        const roleId = roleByBuiltin.get(builtin) ?? roleByBuiltin.get("user");
        if (!roleId) {
          continue;
        }
        batch.push({ email, roleId });
      }
      if (batch.length > 0) {
        try {
          await this.workspaceMembers.createInvitations(
            cached.workspaceId,
            cached.userId,
            batch.slice(0, 50),
          );
        } catch (error) {
          this.logger?.warn("setup invitations failed", {
            workspace_id: cached.workspaceId,
            cause: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const full = await this.sessionService.createSession(cached.userId, {
      ttlSeconds: this.config.sessionTtlSeconds,
      scope: null,
      deviceId: cached.deviceId,
    });

    await this.consumeSetupCode();
    await this.redis.del(this.sessionKey(session.id));
    await this.instanceSettings.markSetupCompleted(this.now().toISOString());

    this.logger?.info("self-host setup completed", {
      event: "setup_completed",
      user_id: cached.userId,
      workspace_id: cached.workspaceId,
    });

    return {
      accessToken: full.accessToken,
      expiresAt: full.expiresAt,
      userId: cached.userId,
      workspaceId: cached.workspaceId,
      vaultId: cached.vaultId,
      deviceId: cached.deviceId,
      tokenType: "Bearer",
    };
  }

  /** Used by AuthService to enforce invite-only after setup. */
  async getRegistrationMode(): Promise<RegistrationMode> {
    if (this.config.deploymentMode !== "self_hosted") {
      return "open";
    }
    return (await this.instanceSettings.read()).registrationMode;
  }

  async hasPendingInvitation(email: string): Promise<boolean> {
    return this.workspaceMembers.hasPendingInvitationForEmail(normalizeEmail(email));
  }

  private async dismissPersonalDataBootstrap(workspaceId: string, userId: string): Promise<void> {
    await this.postgres.query(
      `
        INSERT INTO workspace_member_item_category_preferences (
          id,
          workspace_id,
          user_id,
          favorite_category_ids,
          favorite_template_ids,
          favorite_order,
          personal_data_bootstrap_dismissed
        )
        VALUES (
          $1,
          $2,
          $3,
          '["login","secure_note","credit_card","personal_data","passport","secure_files"]'::jsonb,
          '[]'::jsonb,
          '["category:login","category:secure_note","category:credit_card","category:personal_data","category:passport","category:secure_files"]'::jsonb,
          TRUE
        )
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET
          personal_data_bootstrap_dismissed = TRUE,
          updated_at = now()
      `,
      [generateEntityId(), workspaceId, userId],
    );
  }

  private async bumpAttempts(): Promise<number> {
    const next = await this.redis.incr(SETUP_CODE_ATTEMPTS_KEY);
    if (next === 1) {
      await this.redis.expire(SETUP_CODE_ATTEMPTS_KEY, this.codeTtlSeconds());
    }
    return next;
  }

  private async consumeSetupCode(): Promise<void> {
    await this.redis.del(SETUP_CODE_HASH_KEY);
    await this.redis.del(SETUP_CODE_ATTEMPTS_KEY);
  }

  private async clearSetupCodeState(): Promise<void> {
    await this.redis.del(SETUP_CODE_HASH_KEY);
    await this.redis.del(SETUP_CODE_ATTEMPTS_KEY);
  }
}

/** Constant-time-ish token fingerprint for logs (never the raw token). */
export function setupTokenFingerprint(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 12);
}

export { AuthError };
