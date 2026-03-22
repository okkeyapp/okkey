import { createHash, randomInt, randomUUID } from "node:crypto";
import type { ApiConfig } from "../config.ts";
import type { EmailTemplateService } from "../email/service.ts";
import type { UserRecord, UsersRepository } from "../storage/repositories.ts";

interface AuthChallenge {
  id: string;
  email: string;
  codeHash: string;
  attemptsLeft: number;
  expiresAt: string;
  resendAvailableAt: string;
  createdAt: string;
}

export interface AuthStatePayload {
  id: string;
  email: string;
  userId: string | null;
  createdAt: string;
  /** Email challenge done; session requires TOTP or backup code first */
  pendingTwoFactor?: boolean;
}

export class AuthError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface AuthServiceDeps {
  redis: {
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
  };
  users: Pick<UsersRepository, "findByEmail" | "isTwoFactorEnabled">;
  emailTemplates: Pick<EmailTemplateService, "sendAuthEmailCode">;
  config: ApiConfig;
  now?: () => Date;
  generateCode?: () => string;
  generateId?: () => string;
}

export interface EmailStartInput {
  email: string;
  locale?: string;
  requestIp: string;
}

export interface EmailStartResult {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export interface EmailResendInput {
  challengeId: string;
  locale?: string;
  requestIp: string;
}

export interface EmailConfirmInput {
  challengeId: string;
  code: string;
  requestIp: string;
}

export interface EmailConfirmResult {
  authStateId: string;
  userExists: boolean;
  nextStep: "registration" | "device_check" | "two_factor";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(challengeId: string, code: string): string {
  return createHash("sha256")
    .update(`${challengeId}:${code}`)
    .digest("hex");
}

function challengeKey(id: string): string {
  return `auth:challenge:${id}`;
}

export function authStateRedisKey(id: string): string {
  return `auth:state:${id}`;
}

export class AuthService {
  private readonly redis: AuthServiceDeps["redis"];
  private readonly users: Pick<UsersRepository, "findByEmail" | "isTwoFactorEnabled">;
  private readonly emailTemplates: Pick<EmailTemplateService, "sendAuthEmailCode">;
  private readonly config: ApiConfig;
  private readonly now: () => Date;
  private readonly generateCode: () => string;
  private readonly generateId: () => string;

  constructor(deps: AuthServiceDeps) {
    this.redis = deps.redis;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
    this.generateCode = deps.generateCode ?? createCode;
    this.generateId = deps.generateId ?? randomUUID;
  }

  async startEmailLogin(input: EmailStartInput): Promise<EmailStartResult> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      throw new AuthError("AUTH_EMAIL_INVALID", 400, "invalid email");
    }

    await this.consumeStartRateLimits(email, input.requestIp);

    const now = this.now();
    const challengeId = this.generateId();
    const code = this.generateCode();
    const challenge: AuthChallenge = {
      id: challengeId,
      email,
      codeHash: hashCode(challengeId, code),
      attemptsLeft: this.config.authCodeMaxAttempts,
      expiresAt: new Date(
        now.getTime() + this.config.authCodeTtlSeconds * 1000,
      ).toISOString(),
      resendAvailableAt: new Date(
        now.getTime() + this.config.authResendCooldownSeconds * 1000,
      ).toISOString(),
      createdAt: now.toISOString(),
    };

    await this.redis.setWithTtl(
      challengeKey(challengeId),
      JSON.stringify(challenge),
      this.config.authCodeTtlSeconds,
    );

    await this.emailTemplates.sendAuthEmailCode({
      to: email,
      locale: input.locale,
      variables: {
        code,
        ttlSeconds: this.config.authCodeTtlSeconds,
      },
    });

    return {
      challengeId,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
    };
  }

  async resendEmailCode(input: EmailResendInput): Promise<EmailStartResult> {
    await this.consumeRateLimit(
      `auth:rate:resend:ip:${input.requestIp}`,
      this.config.authRateLimitResendPerIp,
      this.config.authRateLimitWindowSeconds,
    );

    const challenge = await this.loadChallenge(input.challengeId);
    const now = this.now();
    const resendAvailableAt = new Date(challenge.resendAvailableAt);
    if (now.getTime() < resendAvailableAt.getTime()) {
      const retryAfterSeconds = Math.ceil(
        (resendAvailableAt.getTime() - now.getTime()) / 1000,
      );
      throw new AuthError(
        "AUTH_RESEND_TOO_EARLY",
        429,
        "resend cooldown active",
        { retryAfterSeconds },
      );
    }

    const code = this.generateCode();
    const updated: AuthChallenge = {
      ...challenge,
      codeHash: hashCode(challenge.id, code),
      expiresAt: new Date(
        now.getTime() + this.config.authCodeTtlSeconds * 1000,
      ).toISOString(),
      resendAvailableAt: new Date(
        now.getTime() + this.config.authResendCooldownSeconds * 1000,
      ).toISOString(),
    };

    await this.redis.setWithTtl(
      challengeKey(challenge.id),
      JSON.stringify(updated),
      this.config.authCodeTtlSeconds,
    );

    await this.emailTemplates.sendAuthEmailCode({
      to: updated.email,
      locale: input.locale,
      variables: {
        code,
        ttlSeconds: this.config.authCodeTtlSeconds,
      },
    });

    return {
      challengeId: updated.id,
      expiresAt: updated.expiresAt,
      resendAvailableAt: updated.resendAvailableAt,
    };
  }

  async confirmEmailCode(input: EmailConfirmInput): Promise<EmailConfirmResult> {
    await this.consumeRateLimit(
      `auth:rate:confirm:ip:${input.requestIp}`,
      this.config.authRateLimitConfirmPerIp,
      this.config.authRateLimitWindowSeconds,
    );

    const challenge = await this.loadChallenge(input.challengeId);
    if (!/^\d{6}$/.test(input.code)) {
      throw new AuthError("AUTH_CODE_INVALID", 400, "invalid code");
    }

    if (challenge.attemptsLeft <= 0) {
      throw new AuthError(
        "AUTH_CODE_ATTEMPTS_EXCEEDED",
        429,
        "code attempts exceeded",
      );
    }

    const isMatch = challenge.codeHash === hashCode(challenge.id, input.code);
    if (!isMatch) {
      const attemptsLeft = challenge.attemptsLeft - 1;
      const updated: AuthChallenge = {
        ...challenge,
        attemptsLeft,
      };
      await this.redis.setWithTtl(
        challengeKey(challenge.id),
        JSON.stringify(updated),
        ttlSecondsUntil(updated.expiresAt, this.now()),
      );
      if (attemptsLeft <= 0) {
        throw new AuthError(
          "AUTH_CODE_ATTEMPTS_EXCEEDED",
          429,
          "code attempts exceeded",
        );
      }
      throw new AuthError("AUTH_CODE_INVALID", 400, "invalid code", {
        attemptsLeft,
      });
    }

    await this.redis.del(challengeKey(challenge.id));

    const existingUser: UserRecord | null = await this.users.findByEmail(
      challenge.email,
    );
    const pendingTwoFactor = Boolean(
      existingUser && (await this.users.isTwoFactorEnabled(existingUser.id)),
    );
    const authState: AuthStatePayload = {
      id: this.generateId(),
      email: challenge.email,
      userId: existingUser?.id ?? null,
      createdAt: this.now().toISOString(),
      ...(pendingTwoFactor ? { pendingTwoFactor: true } : {}),
    };
    const authStateTtlSeconds = existingUser
      ? pendingTwoFactor
        ? this.config.authPendingTwoFactorTtlSeconds
        : this.config.authCodeTtlSeconds
      : this.config.registrationAuthStateTtlSeconds;
    await this.redis.setWithTtl(
      authStateRedisKey(authState.id),
      JSON.stringify(authState),
      authStateTtlSeconds,
    );

    return {
      authStateId: authState.id,
      userExists: Boolean(existingUser),
      nextStep: existingUser
        ? pendingTwoFactor
          ? "two_factor"
          : "device_check"
        : "registration",
    };
  }

  private async loadChallenge(challengeId: string): Promise<AuthChallenge> {
    const raw = await this.redis.get(challengeKey(challengeId));
    if (!raw) {
      throw new AuthError("AUTH_CODE_EXPIRED", 400, "auth code expired");
    }

    const challenge = JSON.parse(raw) as AuthChallenge;
    const now = this.now();
    if (now.getTime() > new Date(challenge.expiresAt).getTime()) {
      await this.redis.del(challengeKey(challengeId));
      throw new AuthError("AUTH_CODE_EXPIRED", 400, "auth code expired");
    }

    return challenge;
  }

  private async consumeStartRateLimits(
    email: string,
    requestIp: string,
  ): Promise<void> {
    await this.consumeRateLimit(
      `auth:rate:start:email:${email}`,
      this.config.authRateLimitStartPerEmail,
      this.config.authRateLimitWindowSeconds,
    );
    await this.consumeRateLimit(
      `auth:rate:start:ip:${requestIp}`,
      this.config.authRateLimitStartPerIp,
      this.config.authRateLimitWindowSeconds,
    );
  }

  private async consumeRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    if (count > limit) {
      throw new AuthError("AUTH_RATE_LIMITED", 429, "rate limited");
    }
  }

  /** Used by registration flow; returns null if missing or expired. */
  async readAuthState(authStateId: string): Promise<AuthStatePayload | null> {
    const raw = await this.redis.get(authStateRedisKey(authStateId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthStatePayload;
    } catch {
      return null;
    }
  }

  async removeAuthState(authStateId: string): Promise<void> {
    await this.redis.del(authStateRedisKey(authStateId));
  }
}

function ttlSecondsUntil(isoDate: string, now: Date): number {
  const expiresAtMs = new Date(isoDate).getTime();
  return Math.max(1, Math.ceil((expiresAtMs - now.getTime()) / 1000));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
