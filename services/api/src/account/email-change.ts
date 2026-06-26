import { createHash, randomInt } from "node:crypto";
import { generateEntityId } from "../entity-id.ts";
import type { ApiConfig } from "../config.ts";
import type { EmailTemplateService } from "../email/service.ts";
import { UniqueConstraintError } from "../storage/errors.ts";
import type { UsersRepository } from "../storage/repositories.ts";

interface EmailChangeChallenge {
  id: string;
  userId: string;
  email: string;
  codeHash: string;
  attemptsLeft: number;
  expiresAt: string;
  resendAvailableAt: string;
  createdAt: string;
}

export class EmailChangeError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface EmailChangeStartInput {
  userId: string;
  email: string;
  locale?: string;
  acceptLanguage?: string;
  requestIp: string;
}

export interface EmailChangeResendInput {
  userId: string;
  challengeId: string;
  locale?: string;
  acceptLanguage?: string;
  requestIp: string;
}

export interface EmailChangeConfirmInput {
  userId: string;
  challengeId: string;
  code: string;
  requestIp: string;
}

export interface EmailChangeStartResult {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export interface EmailChangeConfirmResult {
  email: string;
}

export interface EmailChangeServiceDeps {
  redis: {
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
  };
  users: Pick<UsersRepository, "findById" | "findByEmail" | "updateEmail">;
  emailTemplates: Pick<EmailTemplateService, "sendAuthEmailCode">;
  config: ApiConfig;
  now?: () => Date;
  generateCode?: () => string;
  generateId?: () => string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(challengeId: string, code: string): string {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}

function challengeKey(id: string): string {
  return `account:email-change:challenge:${id}`;
}

function activeChallengeKey(userId: string): string {
  return `account:email-change:active:${userId}`;
}

function ttlSecondsUntil(isoDate: string, now: Date): number {
  const expiresAtMs = new Date(isoDate).getTime();
  return Math.max(1, Math.ceil((expiresAtMs - now.getTime()) / 1000));
}

export class EmailChangeService {
  private readonly redis: EmailChangeServiceDeps["redis"];
  private readonly users: EmailChangeServiceDeps["users"];
  private readonly emailTemplates: EmailChangeServiceDeps["emailTemplates"];
  private readonly config: ApiConfig;
  private readonly now: () => Date;
  private readonly generateCode: () => string;
  private readonly generateId: () => string;

  constructor(deps: EmailChangeServiceDeps) {
    this.redis = deps.redis;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
    this.generateCode = deps.generateCode ?? createCode;
    this.generateId = deps.generateId ?? generateEntityId;
  }

  async start(input: EmailChangeStartInput): Promise<EmailChangeStartResult> {
    const email = normalizeEmail(input.email);
    await this.assertEmailCanBeUsed(input.userId, email);

    const mappedId = await this.redis.get(activeChallengeKey(input.userId));
    if (mappedId) {
      const existing = await this.peekValidChallenge(mappedId);
      if (existing && existing.userId === input.userId && existing.email === email) {
        return {
          challengeId: existing.id,
          expiresAt: existing.expiresAt,
          resendAvailableAt: existing.resendAvailableAt,
        };
      }
      await this.redis.del(activeChallengeKey(input.userId));
    }

    await this.consumeStartRateLimits(input.userId, email, input.requestIp);

    const now = this.now();
    const challengeId = this.generateId();
    const code = this.generateCode();
    const challenge: EmailChangeChallenge = {
      id: challengeId,
      userId: input.userId,
      email,
      codeHash: hashCode(challengeId, code),
      attemptsLeft: this.config.authCodeMaxAttempts,
      expiresAt: new Date(now.getTime() + this.config.authCodeTtlSeconds * 1000).toISOString(),
      resendAvailableAt: new Date(now.getTime() + this.config.authResendCooldownSeconds * 1000).toISOString(),
      createdAt: now.toISOString(),
    };

    await this.redis.setWithTtl(challengeKey(challengeId), JSON.stringify(challenge), this.config.authCodeTtlSeconds);
    await this.redis.setWithTtl(activeChallengeKey(input.userId), challengeId, this.config.authCodeTtlSeconds);
    await this.sendCode(input.userId, email, code, input.locale, input.acceptLanguage);

    return {
      challengeId,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
    };
  }

  async resend(input: EmailChangeResendInput): Promise<EmailChangeStartResult> {
    await this.consumeRateLimit(
      `account:email-change:rate:resend:ip:${input.requestIp}`,
      this.config.authRateLimitResendPerIp,
      this.config.authRateLimitWindowSeconds,
    );

    const challenge = await this.loadChallengeForUser(input.challengeId, input.userId);
    const now = this.now();
    const resendAvailableAt = new Date(challenge.resendAvailableAt);
    if (now.getTime() < resendAvailableAt.getTime()) {
      const retryAfterSeconds = Math.ceil((resendAvailableAt.getTime() - now.getTime()) / 1000);
      throw new EmailChangeError("EMAIL_CHANGE_RESEND_TOO_EARLY", 429, "resend cooldown active", {
        retryAfterSeconds,
      });
    }

    const code = this.generateCode();
    const updated: EmailChangeChallenge = {
      ...challenge,
      codeHash: hashCode(challenge.id, code),
      expiresAt: new Date(now.getTime() + this.config.authCodeTtlSeconds * 1000).toISOString(),
      resendAvailableAt: new Date(now.getTime() + this.config.authResendCooldownSeconds * 1000).toISOString(),
    };

    await this.redis.setWithTtl(challengeKey(challenge.id), JSON.stringify(updated), this.config.authCodeTtlSeconds);
    await this.redis.setWithTtl(activeChallengeKey(input.userId), updated.id, this.config.authCodeTtlSeconds);
    await this.sendCode(input.userId, updated.email, code, input.locale, input.acceptLanguage);

    return {
      challengeId: updated.id,
      expiresAt: updated.expiresAt,
      resendAvailableAt: updated.resendAvailableAt,
    };
  }

  async confirm(input: EmailChangeConfirmInput): Promise<EmailChangeConfirmResult> {
    await this.consumeRateLimit(
      `account:email-change:rate:confirm:ip:${input.requestIp}`,
      this.config.authRateLimitConfirmPerIp,
      this.config.authRateLimitWindowSeconds,
    );

    const challenge = await this.loadChallengeForUser(input.challengeId, input.userId);
    if (!/^\d{6}$/.test(input.code)) {
      throw new EmailChangeError("EMAIL_CHANGE_CODE_INVALID", 400, "invalid code");
    }

    if (challenge.attemptsLeft <= 0) {
      throw new EmailChangeError("EMAIL_CHANGE_CODE_ATTEMPTS_EXCEEDED", 429, "code attempts exceeded");
    }

    const isMatch = challenge.codeHash === hashCode(challenge.id, input.code);
    if (!isMatch) {
      const attemptsLeft = challenge.attemptsLeft - 1;
      const updated: EmailChangeChallenge = { ...challenge, attemptsLeft };
      const ttlBad = ttlSecondsUntil(updated.expiresAt, this.now());
      await this.redis.setWithTtl(challengeKey(challenge.id), JSON.stringify(updated), ttlBad);
      await this.redis.setWithTtl(activeChallengeKey(input.userId), challenge.id, ttlBad);
      if (attemptsLeft <= 0) {
        await this.deleteChallenge(challenge);
        throw new EmailChangeError("EMAIL_CHANGE_CODE_ATTEMPTS_EXCEEDED", 429, "code attempts exceeded");
      }
      throw new EmailChangeError("EMAIL_CHANGE_CODE_INVALID", 400, "invalid code", { attemptsLeft });
    }

    try {
      const updated = await this.users.updateEmail(input.userId, challenge.email);
      if (!updated) {
        throw new EmailChangeError("EMAIL_CHANGE_USER_NOT_FOUND", 404, "user not found");
      }
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new EmailChangeError("EMAIL_CHANGE_EMAIL_TAKEN", 409, "email already registered");
      }
      throw error;
    } finally {
      await this.deleteChallenge(challenge);
    }

    return { email: challenge.email };
  }

  private async assertEmailCanBeUsed(userId: string, email: string): Promise<void> {
    if (!isValidEmail(email)) {
      throw new EmailChangeError("EMAIL_CHANGE_EMAIL_INVALID", 400, "invalid email");
    }
    const current = await this.users.findById(userId);
    if (!current) {
      throw new EmailChangeError("EMAIL_CHANGE_USER_NOT_FOUND", 404, "user not found");
    }
    if (current.email.toLowerCase() === email) {
      throw new EmailChangeError("EMAIL_CHANGE_EMAIL_SAME", 400, "email is unchanged");
    }
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new EmailChangeError("EMAIL_CHANGE_EMAIL_TAKEN", 409, "email already registered");
    }
  }

  private async sendCode(
    userId: string,
    email: string,
    code: string,
    locale: string | undefined,
    acceptLanguage: string | undefined,
  ): Promise<void> {
    const account = await this.users.findById(userId);
    await this.emailTemplates.sendAuthEmailCode({
      to: email,
      localeHints: {
        userLocale: account?.locale ?? null,
        explicitLocale: locale,
        acceptLanguage,
      },
      variables: {
        code,
        ttlSeconds: this.config.authCodeTtlSeconds,
      },
    });
  }

  private async peekValidChallenge(challengeId: string): Promise<EmailChangeChallenge | null> {
    const raw = await this.redis.get(challengeKey(challengeId));
    if (!raw) {
      return null;
    }
    const challenge = JSON.parse(raw) as EmailChangeChallenge;
    const now = this.now();
    if (now.getTime() > new Date(challenge.expiresAt).getTime() || challenge.attemptsLeft <= 0) {
      await this.deleteChallenge(challenge);
      return null;
    }
    return challenge;
  }

  private async loadChallengeForUser(challengeId: string, userId: string): Promise<EmailChangeChallenge> {
    const challenge = await this.peekValidChallenge(challengeId);
    if (!challenge || challenge.userId !== userId) {
      throw new EmailChangeError("EMAIL_CHANGE_CODE_EXPIRED", 400, "email change code expired");
    }
    return challenge;
  }

  private async deleteChallenge(challenge: EmailChangeChallenge): Promise<void> {
    await this.redis.del(challengeKey(challenge.id));
    await this.redis.del(activeChallengeKey(challenge.userId));
  }

  private async consumeStartRateLimits(userId: string, email: string, requestIp: string): Promise<void> {
    await this.consumeRateLimit(
      `account:email-change:rate:start:user:${userId}`,
      this.config.authRateLimitStartPerEmail,
      this.config.authRateLimitWindowSeconds,
    );
    await this.consumeRateLimit(
      `account:email-change:rate:start:email:${email}`,
      this.config.authRateLimitStartPerEmail,
      this.config.authRateLimitWindowSeconds,
    );
    await this.consumeRateLimit(
      `account:email-change:rate:start:ip:${requestIp}`,
      this.config.authRateLimitStartPerIp,
      this.config.authRateLimitWindowSeconds,
    );
  }

  private async consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
    if (this.config.deployEnv === "dev" || this.config.nodeEnv !== "production") {
      return;
    }
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    if (count > limit) {
      throw new EmailChangeError("EMAIL_CHANGE_RATE_LIMITED", 429, "rate limited");
    }
  }
}
