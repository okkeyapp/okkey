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
  SetupResumeOwnerIds,
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
  workspaceMembers: Pick<
    WorkspaceMembersService,
    "createInvitations" | "hasPendingInvitationForEmail" | "deliverPendingInvitationEmails"
  >;
  postgres: {
    query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): Promise<T[]>;
    transaction<T>(fn: (tx: {
      query<R extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R[]>;
    }) => Promise<T>): Promise<T>;
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

  private setupCodeOperatorHint(): string {
    return "restart the API process to mint a fresh one-time setup code, or set OKKEY_SETUP_CODE / OKKEY_SETUP_CODE_HASH and restart";
  }

  private async isSetupCompleted(): Promise<boolean> {
    return Boolean((await this.instanceSettings.read()).setupCompletedAt);
  }

  /**
   * On self-host boot while first-run is incomplete: ensure a hashed setup code exists in Redis
   * and log the plaintext once when this process minted it. Remints after attempt lockout.
   */
  async ensureBootstrapCode(): Promise<void> {
    if (this.config.deploymentMode !== "self_hosted") {
      return;
    }
    if (await this.isSetupCompleted()) {
      await this.clearSetupCodeState();
      return;
    }

    const attemptsRaw = await this.redis.get(SETUP_CODE_ATTEMPTS_KEY);
    const attempts = Number(attemptsRaw ?? "0");
    const locked = Number.isFinite(attempts) && attempts >= this.maxAttempts();
    if (locked) {
      await this.clearSetupCodeState();
      this.logger?.info("self-host setup code lockout cleared on API start", {
        event: "setup_code_lockout_cleared",
        hint: this.setupCodeOperatorHint(),
      });
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
        unlock_hint: this.setupCodeOperatorHint(),
      });
    } else {
      this.logger?.info("self-host setup code loaded from environment", {
        event: "setup_code_loaded",
        expires_in_seconds: this.codeTtlSeconds(),
        unlock_hint: this.setupCodeOperatorHint(),
      });
    }
  }

  async getStatus(): Promise<SetupStatusResponse> {
    const deploymentMode = this.config.deploymentMode;
    if (deploymentMode !== "self_hosted") {
      return { required: false, deploymentMode };
    }
    // Incomplete first-run stays required even after the owner row exists (finish not done).
    if (await this.isSetupCompleted()) {
      return { required: false, deploymentMode };
    }
    const hash = await this.redis.get(SETUP_CODE_HASH_KEY);
    return { required: Boolean(hash), deploymentMode };
  }

  async verifyCode(rawCode: string): Promise<SetupVerifyResponse> {
    if (this.config.deploymentMode !== "self_hosted") {
      throw new SetupError("SETUP_NOT_AVAILABLE", 404, "setup is not available");
    }
    if (await this.isSetupCompleted()) {
      throw new SetupError("SETUP_NOT_REQUIRED", 409, "setup is already complete");
    }

    const storedHash = await this.redis.get(SETUP_CODE_HASH_KEY);
    if (!storedHash) {
      throw new SetupError("SETUP_CODE_MISSING", 404, "setup code is not available");
    }

    const attemptsRaw = await this.redis.get(SETUP_CODE_ATTEMPTS_KEY);
    const attempts = Number(attemptsRaw ?? "0");
    if (Number.isFinite(attempts) && attempts >= this.maxAttempts()) {
      this.logger?.warn("self-host setup code locked", {
        event: "setup_code_locked",
        hint: this.setupCodeOperatorHint(),
      });
      throw new SetupError(
        "SETUP_CODE_LOCKED",
        429,
        `too many setup code attempts; ${this.setupCodeOperatorHint()}`,
      );
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
        this.logger?.warn("self-host setup code locked", {
          event: "setup_code_locked",
          hint: this.setupCodeOperatorHint(),
        });
        throw new SetupError(
          "SETUP_CODE_LOCKED",
          429,
          `too many setup code attempts; ${this.setupCodeOperatorHint()}`,
        );
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
    // Owner registration creates the first user before finish; do not gate on hasAnyUsers.
    // setupCompletedAt (and deleting the Redis session) close the wizard after finish.
    const instance = await this.instanceSettings.read();
    if (instance.setupCompletedAt) {
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
      default_username: t.defaultUsername ?? null,
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
   * If the same owner already exists on an incomplete setup (recovery exported),
   * rebinds the setup session so finish can complete without creating a second owner.
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
      const rebound = await this.rebindIncompleteOwner(session, existing.id, email);
      if (rebound) {
        return rebound;
      }
      throw new SetupError("EMAIL_TAKEN", 409, "email already registered");
    }

    const claimed = await this.authService.claimEmptyCatalogBootstrap(email);
    if (!claimed) {
      throw new SetupError("SETUP_CLAIM_HELD", 409, "another first registration is in progress");
    }

    const authStateId = await this.authService.createRegistrationAuthStateForTrustedEmail(email);
    session.ownerEmail = email;
    session.authStateId = authStateId;
    delete session.resumeOwner;
    await this.saveSession(session);

    const expiresAt = new Date(
      this.now().getTime() + this.config.registrationAuthStateTtlSeconds * 1000,
    ).toISOString();
    return { authStateId, email, expiresAt };
  }

  /**
   * Bind setup session to an existing sole owner when recovery is already exported.
   * Resume state lives only on the setup session — never writes `registration:result:*`
   * and never mints a session on finish.
   */
  private async rebindIncompleteOwner(
    session: SetupSessionPayload,
    userId: string,
    email: string,
  ): Promise<SetupBeginRegistrationResult | null> {
    if (await this.isSetupCompleted()) {
      return null;
    }
    const ids = await this.resolveOwnerRegistrationIds(userId);
    if (!ids) {
      return null;
    }
    const recoveryRows = await this.postgres.query<{ exported_at: string | Date | null }>(
      `
        SELECT exported_at
        FROM user_vault_recovery_wrap
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId],
    );
    if (!recoveryRows[0]?.exported_at) {
      // Owner exists but recovery was never saved — cannot safely skip registration.
      return null;
    }

    const ttl = this.config.registrationAuthStateTtlSeconds;
    session.ownerEmail = email;
    session.resumeOwner = ids;
    delete session.authStateId;
    await this.saveSession(session);
    const expiresAt = new Date(this.now().getTime() + ttl * 1000).toISOString();
    return { email, expiresAt, alreadyRegistered: true };
  }

  private async resolveOwnerRegistrationIds(
    userId: string,
  ): Promise<{ userId: string; workspaceId: string; vaultId: string; deviceId: string } | null> {
    const workspaceRows = await this.postgres.query<{ id: string }>(
      `
        SELECT id
        FROM workspaces
        WHERE owner_id = $1
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [userId],
    );
    const workspaceId = workspaceRows[0]?.id;
    if (!workspaceId) {
      return null;
    }
    const vaultRows = await this.postgres.query<{ id: string }>(
      `
        SELECT id
        FROM vaults
        WHERE workspace_id = $1 AND is_personal = TRUE AND owner_id = $2
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [workspaceId, userId],
    );
    const vaultId = vaultRows[0]?.id;
    if (!vaultId) {
      return null;
    }
    const deviceRows = await this.postgres.query<{ id: string }>(
      `
        SELECT id
        FROM devices
        WHERE user_id = $1
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [userId],
    );
    const deviceId = deviceRows[0]?.id;
    if (!deviceId) {
      return null;
    }
    return { userId, workspaceId, vaultId, deviceId };
  }

  /**
   * Apply workspace branding + invites, mark setup complete, consume the setup code.
   * First-owner path: also mints a full device-bound session (registration just completed
   * in this setup session). Resume path: never mints a session — client must sign in normally.
   * Durable finish writes run in one Postgres transaction so a failure never marks setup
   * complete while leaving half-applied branding/invites.
   */
  async finish(token: string, input: SetupFinishInput): Promise<SetupFinishResult> {
    const session = await this.requireSession(token);
    if (!session.ownerEmail) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }

    const resume = Boolean(session.resumeOwner);
    const ownerIds = resume
      ? this.requireResumeOwnerIds(session)
      : await this.requireRegistrationResultIds(session);

    const recoveryRows = await this.postgres.query<{ exported_at: string | Date | null }>(
      `
        SELECT exported_at
        FROM user_vault_recovery_wrap
        WHERE user_id = $1
        LIMIT 1
      `,
      [ownerIds.userId],
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
    const completedAt = this.now().toISOString();
    const inviteTtlMs = 14 * 24 * 60 * 60 * 1000;

    await this.postgres.transaction(async (tx) => {
      await tx.query(
        `
          UPDATE workspaces
          SET name = $1, tile_color = $2, updated_at = now()
          WHERE id = $3
        `,
        [workspaceName, tileColor, ownerIds.workspaceId],
      );

      if (input.dismissPersonalDataBootstrap === true) {
        await tx.query(
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
          [generateEntityId(), ownerIds.workspaceId, ownerIds.userId],
        );
      }

      const invitations = input.invitations ?? [];
      if (invitations.length > 0) {
        const roleRows = await tx.query<{ id: string; builtin_key: string | null }>(
          `
            SELECT id, builtin_key
            FROM roles
            WHERE workspace_id = $1 AND builtin_key IN ('admin', 'user')
          `,
          [ownerIds.workspaceId],
        );
        const roleByBuiltin = new Map(
          roleRows.map((r) => [String(r.builtin_key), String(r.id)] as const),
        );
        const batch: Array<{ email: string; roleId: string }> = [];
        for (const invite of invitations.slice(0, 50)) {
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
            throw new SetupError(
              "SETUP_ROLE_MISSING",
              500,
              "workspace roles are missing; cannot create invitations",
            );
          }
          batch.push({ email, roleId });
        }

        for (const item of batch) {
          const invitationId = generateEntityId();
          const rawToken = randomBytes(32).toString("base64url");
          const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
          const expiresAt = new Date(this.now().getTime() + inviteTtlMs).toISOString();
          await tx.query(
            `
              INSERT INTO workspace_invitations (
                id, workspace_id, email, role_id, invited_by_user_id, token_hash, status,
                expires_at, delivery_status, delivery_method
              ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7::timestamptz, 'pending', 'email')
            `,
            [
              invitationId,
              ownerIds.workspaceId,
              item.email,
              item.roleId,
              ownerIds.userId,
              tokenHash,
              expiresAt,
            ],
          );
        }
      }

      const marked = await tx.query<{ setup_completed_at: string | Date | null }>(
        `
          UPDATE server_instance_settings
          SET setup_completed_at = COALESCE(setup_completed_at, $1::timestamptz),
              updated_at = now()
          WHERE id = TRUE
          RETURNING setup_completed_at
        `,
        [completedAt],
      );
      if (!marked[0]?.setup_completed_at) {
        throw new SetupError("SETUP_INSTANCE_MISSING", 500, "server instance settings row missing");
      }
    });

    // Mirror completion into the settings store view (same DB after commit; in-memory tests too).
    await this.instanceSettings.markSetupCompleted(completedAt);

    // Same path as SMTP-activate hook: deliver pending email invites when mail is active.
    try {
      const mail = await this.mailSettings.getPublicSettings();
      if (mail.smtpActive) {
        const delivery = await this.workspaceMembers.deliverPendingInvitationEmails();
        this.logger?.info("setup invitation emails delivered", {
          event: "setup_invites_delivered",
          delivered: delivery.delivered,
          workspace_id: ownerIds.workspaceId,
        });
      }
    } catch (error) {
      this.logger?.warn("setup invitation delivery failed", {
        workspace_id: ownerIds.workspaceId,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    await this.consumeSetupCode();
    await this.redis.del(this.sessionKey(session.id));

    this.logger?.info("self-host setup completed", {
      event: "setup_completed",
      user_id: ownerIds.userId,
      workspace_id: ownerIds.workspaceId,
      resume,
      sign_in_required: resume,
    });

    // Resume must never mint a session — only the first-owner path (registration in this
    // setup session) issues a full device-bound token.
    if (resume) {
      return {
        signInRequired: true,
        accessToken: null,
        expiresAt: null,
        userId: ownerIds.userId,
        workspaceId: ownerIds.workspaceId,
        vaultId: ownerIds.vaultId,
        deviceId: ownerIds.deviceId,
        tokenType: null,
      };
    }

    const full = await this.sessionService.createSession(ownerIds.userId, {
      ttlSeconds: this.config.sessionTtlSeconds,
      scope: null,
      deviceId: ownerIds.deviceId,
    });

    return {
      signInRequired: false,
      accessToken: full.accessToken,
      expiresAt: full.expiresAt,
      userId: ownerIds.userId,
      workspaceId: ownerIds.workspaceId,
      vaultId: ownerIds.vaultId,
      deviceId: ownerIds.deviceId,
      tokenType: "Bearer",
    };
  }

  private requireResumeOwnerIds(session: SetupSessionPayload): SetupResumeOwnerIds {
    const ids = session.resumeOwner;
    if (!ids?.userId || !ids.workspaceId || !ids.vaultId || !ids.deviceId) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }
    return ids;
  }

  private async requireRegistrationResultIds(
    session: SetupSessionPayload,
  ): Promise<SetupResumeOwnerIds> {
    if (!session.authStateId) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }
    // Same key as registration/service.ts registrationResultRedisKey (avoid importing that module).
    const cachedRaw = await this.redis.get(`registration:result:${session.authStateId}`);
    if (!cachedRaw) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }
    let cached: SetupResumeOwnerIds;
    try {
      cached = JSON.parse(cachedRaw) as SetupResumeOwnerIds;
    } catch {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }
    if (!cached.userId || !cached.workspaceId || !cached.vaultId || !cached.deviceId) {
      throw new SetupError("SETUP_REGISTRATION_INCOMPLETE", 409, "owner registration is incomplete");
    }
    return cached;
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
