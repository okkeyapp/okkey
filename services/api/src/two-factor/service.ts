import { randomBytes } from "node:crypto";
import { generateEntityId } from "../entity-id.ts";
import type { AuthService, AuthStatePayload } from "../auth/service.ts";
import type { ApiConfig } from "../config.ts";
import type { EmailTemplateService } from "../email/service.ts";
import { buildEmailAppPathUrl } from "../email/service.ts";
import {
  generateBackupCodePlaintext,
  hashBackupCode,
  normalizeBackupCodeInput,
} from "../crypto/backup-code.ts";
import { deriveAes256KeyFromSessionSecret, openSecret, sealSecret } from "../crypto/server-aes.ts";
import { wipeSecretBytes } from "../crypto/secret-lifecycle.ts";
import { base32Encode, verifyTotpCode } from "../crypto/totp-rfc6238.ts";
import type { SessionService } from "../session/service.ts";
import type { TwoFactorRepository, UsersRepository } from "../storage/repositories.ts";

export class TwoFactorError extends Error {
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

export interface TwoFactorServiceDeps {
  redis: {
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
  };
  twoFactorRepo: TwoFactorRepository;
  users: Pick<UsersRepository, "findById" | "isTwoFactorEnabled" | "setTwoFactorEnabled">;
  authService: Pick<AuthService, "readAuthState" | "removeAuthState">;
  sessionService: SessionService;
  config: ApiConfig;
  emailTemplates?: Pick<
    EmailTemplateService,
    | "sendTwoFactorEnabledBestEffort"
    | "sendTwoFactorBackupCodesRegeneratedBestEffort"
  >;
  now?: () => Date;
}

function enrollRedisKey(enrollmentId: string): string {
  return `totp:enroll:${enrollmentId}`;
}

function enrollActiveUserKey(userId: string): string {
  return `totp:enroll:active:${userId}`;
}

function verifyAttemptsKey(authStateId: string): string {
  return `2fa:verify:attempts:${authStateId}`;
}

interface PendingTotpPayload {
  userId: string;
  secretB64: string;
}

export class TwoFactorService {
  private readonly redis: TwoFactorServiceDeps["redis"];
  private readonly twoFactorRepo: TwoFactorRepository;
  private readonly users: TwoFactorServiceDeps["users"];
  private readonly authService: TwoFactorServiceDeps["authService"];
  private readonly sessionService: SessionService;
  private readonly config: ApiConfig;
  private readonly emailTemplates?: Pick<
    EmailTemplateService,
    | "sendTwoFactorEnabledBestEffort"
    | "sendTwoFactorBackupCodesRegeneratedBestEffort"
  >;
  private readonly now: () => Date;

  constructor(deps: TwoFactorServiceDeps) {
    this.redis = deps.redis;
    this.twoFactorRepo = deps.twoFactorRepo;
    this.users = deps.users;
    this.authService = deps.authService;
    this.sessionService = deps.sessionService;
    this.config = deps.config;
    this.emailTemplates = deps.emailTemplates;
    this.now = deps.now ?? (() => new Date());
  }

  private aesKey(): Buffer {
    return deriveAes256KeyFromSessionSecret(this.config.sessionSecret);
  }

  private withAesKey<T>(fn: (key: Buffer) => T): T {
    const key = this.aesKey();
    try {
      return fn(key);
    } finally {
      wipeSecretBytes(key);
    }
  }

  private async consumeRateLimitTwoFactorVerifyIp(requestIp: string): Promise<void> {
    const key = `auth:rate:2fa:verify:ip:${requestIp}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.config.authRateLimitWindowSeconds);
    }
    if (count > this.config.authRateLimitTwoFactorVerifyPerIp) {
      throw new TwoFactorError("AUTH_RATE_LIMITED", 429, "rate limited");
    }
  }

  private async registerFailedVerifyAttempt(authStateId: string): Promise<void> {
    const key = verifyAttemptsKey(authStateId);
    const n = await this.redis.incr(key);
    if (n === 1) {
      await this.redis.expire(key, this.config.authPendingTwoFactorTtlSeconds);
    }
    if (n > this.config.twoFactorVerifyMaxAttemptsPerState) {
      throw new TwoFactorError(
        "TWO_FACTOR_ATTEMPTS_EXCEEDED",
        429,
        "too many invalid codes",
      );
    }
  }

  private async clearVerifyAttempts(authStateId: string): Promise<void> {
    await this.redis.del(verifyAttemptsKey(authStateId));
  }

  private async requireLoginAuthState(authStateId: string): Promise<AuthStatePayload> {
    const state = await this.authService.readAuthState(authStateId);
    if (!state) {
      throw new TwoFactorError(
        "AUTH_CHALLENGE_EXPIRED",
        410,
        "auth state expired or missing",
      );
    }
    return state;
  }

  async bootstrapSessionAfterEmail(params: {
    authStateId: string;
  }): Promise<{
    accessToken: string;
    expiresAt: string;
    userId: string;
    tokenType: "Bearer";
  }> {
    const state = await this.requireLoginAuthState(params.authStateId);
    if (state.pendingTwoFactor) {
      throw new TwoFactorError(
        "TWO_FACTOR_REQUIRED",
        400,
        "two-factor verification required",
      );
    }
    if (!state.userId) {
      throw new TwoFactorError(
        "AUTH_CHALLENGE_INVALID",
        400,
        "auth state is not valid for session bootstrap",
      );
    }
    const session = await this.sessionService.createSession(state.userId);
    await this.authService.removeAuthState(state.id);
    return {
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      userId: state.userId,
      tokenType: "Bearer",
    };
  }

  async verifyTwoFactorAndCreateSession(params: {
    authStateId: string;
    code: string;
    requestIp: string;
  }): Promise<{
    accessToken: string;
    expiresAt: string;
    userId: string;
    tokenType: "Bearer";
  }> {
    await this.consumeRateLimitTwoFactorVerifyIp(params.requestIp);
    const state = await this.requireLoginAuthState(params.authStateId);
    if (!state.pendingTwoFactor || !state.userId) {
      throw new TwoFactorError(
        "TWO_FACTOR_SETUP_INVALID",
        400,
        "two-factor step not pending for this auth state",
      );
    }

    const userId = state.userId;
    const enc = await this.twoFactorRepo.getEncryptedTotpSecret(userId);
    if (!enc) {
      throw new TwoFactorError(
        "TWO_FACTOR_NOT_ENABLED",
        400,
        "two-factor is not configured",
      );
    }

    let secret: Buffer | undefined;
    let trimmed = "";
    let totpOk = false;
    let backupOk = false;
    try {
      try {
        secret = this.withAesKey((key) => openSecret(key, enc));
      } catch {
        throw new TwoFactorError(
          "INTERNAL_SERVER_ERROR",
          500,
          "totp storage corrupted",
        );
      }

      trimmed = params.code.trim();
      const unixSeconds = Math.floor(this.now().getTime() / 1000);

      totpOk =
        /^\d{6}$/.test(trimmed) &&
        verifyTotpCode({
          secret,
          code: trimmed,
          unixSeconds,
          periodSeconds: 30,
          digits: 6,
          windowSteps: this.config.twoFactorVerifyClockSteps,
        });

      if (!totpOk) {
        const isSixDigitTotpAttempt = /^\d{6}$/.test(trimmed);
        if (!isSixDigitTotpAttempt) {
          const unusedBackups = await this.twoFactorRepo.countUnusedBackupCodes(userId);
          if (unusedBackups === 0) {
            throw new TwoFactorError(
              "TWO_FACTOR_BACKUP_DEPLETED",
              400,
              "no backup codes remaining",
            );
          }
          const backupHash = hashBackupCode(trimmed, this.config.sessionSecret);
          backupOk = await this.twoFactorRepo.consumeBackupCode(userId, backupHash);
        }
      }
    } finally {
      wipeSecretBytes(secret);
    }

    if (!totpOk && !backupOk) {
      await this.registerFailedVerifyAttempt(state.id);
      const norm = normalizeBackupCodeInput(trimmed);
      if (norm.length >= 8 && !/^\d{6}$/.test(trimmed)) {
        throw new TwoFactorError("TWO_FACTOR_BACKUP_INVALID", 400, "invalid backup code");
      }
      throw new TwoFactorError("TWO_FACTOR_INVALID_CODE", 400, "invalid code");
    }

    await this.clearVerifyAttempts(state.id);
    const session = await this.sessionService.createSession(userId);
    await this.authService.removeAuthState(state.id);
    return {
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      userId,
      tokenType: "Bearer",
    };
  }

  async getStatus(userId: string): Promise<{
    enabled: boolean;
    backupCodesRemaining: number;
    backupCodesGeneratedAt: string | null;
    backupCodesExportedAt: string | null;
  }> {
    const enabled = await this.users.isTwoFactorEnabled(userId);
    if (!enabled) {
      return {
        enabled: false,
        backupCodesRemaining: 0,
        backupCodesGeneratedAt: null,
        backupCodesExportedAt: null,
      };
    }
    const [backupCodesRemaining, generatedAt, exportedAt] = await Promise.all([
      this.twoFactorRepo.countUnusedBackupCodes(userId),
      this.twoFactorRepo.getLatestBackupCodesCreatedAt(userId),
      this.twoFactorRepo.getBackupCodesExportedAt(userId),
    ]);
    return {
      enabled: true,
      backupCodesRemaining,
      backupCodesGeneratedAt: generatedAt ? generatedAt.toISOString() : null,
      backupCodesExportedAt: exportedAt ? exportedAt.toISOString() : null,
    };
  }

  async ackBackupCodesExport(userId: string): Promise<{
    enabled: boolean;
    backupCodesRemaining: number;
    backupCodesGeneratedAt: string | null;
    backupCodesExportedAt: string | null;
  }> {
    if (!(await this.users.isTwoFactorEnabled(userId))) {
      throw new TwoFactorError("TWO_FACTOR_NOT_ENABLED", 400, "two-factor not enabled");
    }
    const unused = await this.twoFactorRepo.countUnusedBackupCodes(userId);
    if (unused <= 0) {
      throw new TwoFactorError(
        "TWO_FACTOR_BACKUP_DEPLETED",
        400,
        "no backup codes remaining",
      );
    }
    const exportedAt = await this.twoFactorRepo.ackBackupCodesExport(userId);
    if (!exportedAt) {
      throw new TwoFactorError("TWO_FACTOR_NOT_ENABLED", 400, "two-factor not enabled");
    }
    return this.getStatus(userId);
  }

  async enrollTotpStart(userId: string): Promise<{
    enrollmentId: string;
    secretBase32: string;
    otpauthUri: string;
    periodSeconds: number;
    digits: number;
    algorithm: "SHA1";
  }> {
    if (await this.users.isTwoFactorEnabled(userId)) {
      throw new TwoFactorError(
        "TWO_FACTOR_ALREADY_ENABLED",
        400,
        "two-factor already enabled",
      );
    }
    const user = await this.users.findById(userId);
    if (!user) {
      throw new TwoFactorError("AUTH_REQUIRED", 401, "user not found");
    }

    const secret = randomBytes(20);
    const secretBase32 = base32Encode(secret);
    const enrollmentId = generateEntityId();
    const payload: PendingTotpPayload = {
      userId,
      secretB64: Buffer.from(secret).toString("base64"),
    };
    const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
    const sealed = (() => {
      try {
        return this.withAesKey((key) => sealSecret(key, payloadBytes));
      } finally {
        wipeSecretBytes(payloadBytes);
      }
    })();
    const activeKey = enrollActiveUserKey(userId);
    const prev = await this.redis.get(activeKey);
    if (prev) {
      await this.redis.del(enrollRedisKey(prev));
    }
    await this.redis.setWithTtl(
      enrollRedisKey(enrollmentId),
      sealed.toString("base64"),
      this.config.totpEnrollmentTtlSeconds,
    );
    await this.redis.setWithTtl(
      activeKey,
      enrollmentId,
      this.config.totpEnrollmentTtlSeconds,
    );

    const issuer = "Okkey";
    const label = encodeURIComponent(`${issuer}:${user.email}`);
    const otpauthUri = `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

    try {
      return {
        enrollmentId,
        secretBase32,
        otpauthUri,
        periodSeconds: 30,
        digits: 6,
        algorithm: "SHA1",
      };
    } finally {
      wipeSecretBytes(secret);
      wipeSecretBytes(sealed);
    }
  }

  async enrollTotpConfirm(
    userId: string,
    input: { enrollmentId: string; code: string },
    context?: { acceptLanguage?: string },
  ): Promise<{
    backupCodes: string[];
  }> {
    if (await this.users.isTwoFactorEnabled(userId)) {
      throw new TwoFactorError(
        "TWO_FACTOR_ALREADY_ENABLED",
        400,
        "two-factor already enabled",
      );
    }
    const raw = await this.redis.get(enrollRedisKey(input.enrollmentId));
    if (!raw) {
      throw new TwoFactorError(
        "TWO_FACTOR_SETUP_INVALID",
        400,
        "enrollment expired or unknown",
      );
    }

    let payload: PendingTotpPayload;
    let opened: Buffer | undefined;
    try {
      opened = this.withAesKey((key) =>
        openSecret(key, Uint8Array.from(Buffer.from(raw, "base64"))));
      payload = JSON.parse(opened.toString("utf8")) as PendingTotpPayload;
    } catch {
      throw new TwoFactorError(
        "TWO_FACTOR_SETUP_INVALID",
        400,
        "enrollment payload invalid",
      );
    } finally {
      wipeSecretBytes(opened);
    }

    if (payload.userId !== userId) {
      throw new TwoFactorError("TWO_FACTOR_SETUP_INVALID", 400, "enrollment mismatch");
    }

    const secret = Buffer.from(payload.secretB64, "base64");
    const unixSeconds = Math.floor(this.now().getTime() / 1000);
    const ok = verifyTotpCode({
      secret,
      code: input.code.trim(),
      unixSeconds,
      periodSeconds: 30,
      digits: 6,
      windowSteps: this.config.twoFactorVerifyClockSteps,
    });
    if (!ok) {
      throw new TwoFactorError("TWO_FACTOR_INVALID_CODE", 400, "invalid totp code");
    }

    const sealedForDb = this.withAesKey((key) => sealSecret(key, secret));

    const backupCodes: string[] = [];
    const backupHashes: string[] = [];
    for (let i = 0; i < this.config.twoFactorBackupCodesCount; i++) {
      const plain = generateBackupCodePlaintext();
      backupCodes.push(plain);
      backupHashes.push(hashBackupCode(plain, this.config.sessionSecret));
    }

    try {
      await this.twoFactorRepo.enableTotpWithFreshBackupCodes(
        userId,
        sealedForDb,
        backupHashes,
      );
      await this.users.setTwoFactorEnabled(userId, true);

      await this.redis.del(enrollRedisKey(input.enrollmentId));
      await this.redis.del(enrollActiveUserKey(userId));

      const user = await this.users.findById(userId);
      if (user && this.emailTemplates) {
        void this.emailTemplates.sendTwoFactorEnabledBestEffort({
          to: user.email,
          localeHints: {
            userLocale: user.locale,
            acceptLanguage: context?.acceptLanguage,
          },
          variables: {
            occurredAtIso: this.now().toISOString(),
            securitySettingsUrl: buildEmailAppPathUrl(
              this.config.publicAppBaseUrl,
              "/settings/security",
            ),
          },
        });
      }

      return { backupCodes };
    } finally {
      wipeSecretBytes(secret);
      wipeSecretBytes(sealedForDb);
    }
  }

  async regenerateBackupCodes(
    userId: string,
    totpCode: string,
    context?: { acceptLanguage?: string },
  ): Promise<{ backupCodes: string[] }> {
    if (!(await this.users.isTwoFactorEnabled(userId))) {
      throw new TwoFactorError("TWO_FACTOR_NOT_ENABLED", 400, "two-factor not enabled");
    }
    const enc = await this.twoFactorRepo.getEncryptedTotpSecret(userId);
    if (!enc) {
      throw new TwoFactorError("TWO_FACTOR_NOT_ENABLED", 400, "two-factor not enabled");
    }
    let secret: Buffer | undefined;
    let ok = false;
    try {
      secret = this.withAesKey((key) => openSecret(key, enc));
      const unixSeconds = Math.floor(this.now().getTime() / 1000);
      ok = verifyTotpCode({
        secret,
        code: totpCode.trim(),
        unixSeconds,
        periodSeconds: 30,
        digits: 6,
        windowSteps: this.config.twoFactorVerifyClockSteps,
      });
    } finally {
      wipeSecretBytes(secret);
    }
    if (!ok) {
      throw new TwoFactorError("TWO_FACTOR_INVALID_CODE", 400, "invalid totp code");
    }

    const backupCodes: string[] = [];
    const backupHashes: string[] = [];
    for (let i = 0; i < this.config.twoFactorBackupCodesCount; i++) {
      const plain = generateBackupCodePlaintext();
      backupCodes.push(plain);
      backupHashes.push(hashBackupCode(plain, this.config.sessionSecret));
    }
    await this.twoFactorRepo.replaceBackupCodesOnly(userId, backupHashes);

    const user = await this.users.findById(userId);
    if (user && this.emailTemplates) {
      void this.emailTemplates.sendTwoFactorBackupCodesRegeneratedBestEffort({
        to: user.email,
        localeHints: {
          userLocale: user.locale,
          acceptLanguage: context?.acceptLanguage,
        },
        variables: {
          occurredAtIso: this.now().toISOString(),
          securitySettingsUrl: buildEmailAppPathUrl(
            this.config.publicAppBaseUrl,
            "/settings/security",
          ),
        },
      });
    }

    return { backupCodes };
  }

  async disableTwoFactor(
    userId: string,
    input: { totpCode?: string; backupCode?: string },
  ): Promise<void> {
    if (!(await this.users.isTwoFactorEnabled(userId))) {
      throw new TwoFactorError("TWO_FACTOR_NOT_ENABLED", 400, "two-factor not enabled");
    }

    const totp = input.totpCode?.trim();
    const backup = input.backupCode?.trim();
    if (!totp && !backup) {
      throw new TwoFactorError(
        "TWO_FACTOR_SETUP_INVALID",
        400,
        "totp_code or backup_code required",
      );
    }

    let verified = false;
    if (totp && /^\d{6}$/.test(totp)) {
      const enc = await this.twoFactorRepo.getEncryptedTotpSecret(userId);
      if (enc) {
        let secret: Buffer | undefined;
        try {
          secret = this.withAesKey((key) => openSecret(key, enc));
          const unixSeconds = Math.floor(this.now().getTime() / 1000);
          verified = verifyTotpCode({
            secret,
            code: totp,
            unixSeconds,
            periodSeconds: 30,
            digits: 6,
            windowSteps: this.config.twoFactorVerifyClockSteps,
          });
        } finally {
          wipeSecretBytes(secret);
        }
      }
    }

    if (!verified && backup) {
      const backupHash = hashBackupCode(backup, this.config.sessionSecret);
      verified = await this.twoFactorRepo.consumeBackupCode(userId, backupHash);
      if (!verified) {
        throw new TwoFactorError("TWO_FACTOR_BACKUP_INVALID", 400, "invalid backup code");
      }
    }

    if (!verified) {
      throw new TwoFactorError("TWO_FACTOR_INVALID_CODE", 400, "invalid code");
    }

    await this.twoFactorRepo.disableTotpAndBackupCodes(userId);
    await this.users.setTwoFactorEnabled(userId, false);
    await this.redis.del(enrollActiveUserKey(userId));
  }
}
