import type { AuthService } from "../auth/service.ts";
import type { ApiConfig } from "../config.ts";
import {
  CRYPTO_CAPABILITY_REQUIRED,
  CRYPTO_CAPABILITY_REQUIRED_STATUS_CODE,
  buildCapabilityPolicyDetails,
  evaluateCapabilityDecision,
} from "../crypto/capability-policy.ts";
import { getCryptoRolloutGateViolation } from "../crypto/rollout-gates.ts";
import { mergeEncryptedBlobMeta, parseEncryptedBlobInput, type EncryptedBlob } from "../crypto/encrypted-blob.ts";
import { logCryptoPolicyViolation } from "../crypto/policy-log.ts";
import {
  getCryptoWritePolicyViolation,
} from "../crypto/policy.ts";
import type { Logger } from "../logger.ts";
import {
  recordCapabilityDecision,
  recordCryptoOperationOutcome,
  startCryptoOperationTimer,
} from "../observability/crypto-rollout.ts";
import type { SessionService } from "../session/service.ts";
import { SESSION_SCOPE_REGISTRATION_RECOVERY } from "../session/scopes.ts";
import type { PostgresDatabase } from "../storage/postgres.ts";
import type { UsersRepository } from "../storage/repositories.ts";
import { insertRegistrationBundle } from "./repository.ts";
import { assertOpaqueSplitKeyShare } from "./split-key-transport-policy.ts";

const KDF_SALT_LEN = 16;
const ED25519_PK_LEN = 32;
/** ML-KEM-768 encapsulation key (FIPS 203). */
const MLKEM768_EK_LEN = 1184;
/** Min `EncryptedBlob.payload` bytes: 24-byte nonce + AEAD ciphertext of v1 hybrid private bundle. */
const MIN_ENCRYPTED_USER_IDENTITY_PAYLOAD_LEN = 2473;
const SUPPORTED_KDF_PARAMS_VERSIONS = new Set([1, 2]);

export class RegistrationError extends Error {
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

export interface RegisterCompleteInput {
  authStateId: string;
  userPublicKey: string;
  userPublicPqKey: string;
  encryptedPrivateKey: EncryptedBlob;
  serverKeyShare: Uint8Array;
  passwordKdfSalt: Uint8Array;
  passwordKdfParamsVersion: number;
  deviceFingerprint: string;
  deviceName: string;
  devicePublicKey: string;
  deviceShare: Uint8Array;
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  clientType: string;
  userAgent: string;
  requestIp: string;
  deviceCryptoCapable?: boolean;
  /** When set, used as the default workspace name instead of "Personal". */
  personalWorkspaceName?: string;
  /** When set, used as the personal vault name instead of {@link DEFAULT_PERSONAL_VAULT_NAME}. */
  personalVaultName?: string;
  firstName?: string | null;
  lastName?: string | null;
}

/** Public ids always returned; bootstrap token only on first successful completion. */
export interface RegisterCompleteResult {
  userId: string;
  workspaceId: string;
  vaultId: string;
  deviceId: string;
  deviceStatus: "trusted";
  accessToken?: string;
  expiresAt?: string;
  tokenType?: "Bearer";
  /** Present when `accessToken` is issued; always `registration_recovery`. */
  scope?: typeof SESSION_SCOPE_REGISTRATION_RECOVERY;
}

/** Cached idempotency payload — never includes bearer material. */
interface RegisterCompleteCachedIds {
  userId: string;
  workspaceId: string;
  vaultId: string;
  deviceId: string;
  deviceStatus: "trusted";
}

export interface RegistrationServiceDeps {
  authService: AuthService;
  users: Pick<UsersRepository, "findByEmail">;
  postgres: PostgresDatabase;
  redis: {
    get(key: string): Promise<string | null>;
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
  };
  sessionService: Pick<SessionService, "createSession">;
  config: ApiConfig;
  now?: () => Date;
  log?: Logger;
}

function registrationResultRedisKey(authStateId: string): string {
  return `registration:result:${authStateId}`;
}

export class RegistrationService {
  private readonly authService: AuthService;
  private readonly users: Pick<UsersRepository, "findByEmail">;
  private readonly postgres: PostgresDatabase;
  private readonly redis: RegistrationServiceDeps["redis"];
  private readonly sessionService: Pick<SessionService, "createSession">;
  private readonly config: ApiConfig;
  private readonly now: () => Date;
  private readonly log: Logger | undefined;

  constructor(deps: RegistrationServiceDeps) {
    this.authService = deps.authService;
    this.users = deps.users;
    this.postgres = deps.postgres;
    this.redis = deps.redis;
    this.sessionService = deps.sessionService;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log;
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
      throw new RegistrationError("AUTH_RATE_LIMITED", 429, "rate limited");
    }
  }

  private async consumeRegisterCompleteRateLimits(
    requestIp: string | null,
    email: string | null,
  ): Promise<void> {
    if (requestIp) {
      await this.consumeRateLimit(
        `auth:rate:register-complete:ip:${requestIp}`,
        this.config.authRateLimitRegisterCompletePerIp,
        this.config.authRateLimitWindowSeconds,
      );
    }
    if (email) {
      await this.consumeRateLimit(
        `auth:rate:register-complete:email:${email}`,
        this.config.authRateLimitRegisterCompletePerEmail,
        this.config.authRateLimitWindowSeconds,
      );
    }
  }

  private parseCachedIds(raw: string): RegisterCompleteCachedIds | null {
    try {
      const parsed = JSON.parse(raw) as Partial<RegisterCompleteCachedIds>;
      if (
        parsed.userId &&
        parsed.workspaceId &&
        parsed.vaultId &&
        parsed.deviceId &&
        parsed.deviceStatus === "trusted"
      ) {
        return {
          userId: parsed.userId,
          workspaceId: parsed.workspaceId,
          vaultId: parsed.vaultId,
          deviceId: parsed.deviceId,
          deviceStatus: "trusted",
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async completeRegistration(input: RegisterCompleteInput): Promise<RegisterCompleteResult> {
    const stopTimer = startCryptoOperationTimer(this.log, {
      operation: "registration.complete",
      deployEnv: this.config.deployEnv,
      rolloutMode: this.config.cryptoRolloutMode,
    });
    const rolloutGateViolation = getCryptoRolloutGateViolation(this.config, "registration.complete");
    if (rolloutGateViolation) {
      recordCryptoOperationOutcome(this.log, {
        operation: "registration.complete",
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "blocked",
        code: rolloutGateViolation.code,
      });
      stopTimer();
      throw new RegistrationError(
        rolloutGateViolation.code,
        rolloutGateViolation.statusCode,
        rolloutGateViolation.message,
        rolloutGateViolation.details,
      );
    }

    // IP budget first (no auth-state dependency), then idempotent cache, then email budget.
    await this.consumeRegisterCompleteRateLimits(input.requestIp, null);

    const cached = await this.redis.get(registrationResultRedisKey(input.authStateId));
    if (cached) {
      const ids = this.parseCachedIds(cached);
      if (ids) {
        recordCryptoOperationOutcome(this.log, {
          operation: "registration.complete",
          deployEnv: this.config.deployEnv,
          rolloutMode: this.config.cryptoRolloutMode,
          outcome: "success",
        });
        stopTimer();
        // Idempotent replay: public ids only — never re-mint or return a bearer.
        return ids;
      }
    }

    const authState = await this.authService.readAuthState(input.authStateId);
    if (!authState) {
      throw new RegistrationError(
        "AUTH_CHALLENGE_EXPIRED",
        410,
        "auth state expired or missing",
      );
    }
    await this.consumeRegisterCompleteRateLimits(null, authState.email);
    if (authState.userId !== null) {
      throw new RegistrationError(
        "AUTH_CHALLENGE_INVALID",
        400,
        "auth state is not valid for new user registration",
      );
    }

    const existing = await this.users.findByEmail(authState.email);
    if (existing) {
      throw new RegistrationError(
        "REGISTRATION_ALREADY_COMPLETED",
        409,
        "user already registered for this email",
      );
    }

    this.validateCryptoPayload(input);

    const nowIso = this.now().toISOString();

    try {
      const encryptedPrivateKey = this.validateEncryptedPrivateKey(input.encryptedPrivateKey);
      const bundle = await this.postgres.transaction(async (tx) => {
        return insertRegistrationBundle(tx, {
          email: authState.email,
          publicKey: input.userPublicKey.trim(),
          publicPqKey: input.userPublicPqKey.trim(),
          encryptedPrivateKey,
          serverKeyShare: input.serverKeyShare,
          passwordKdfSalt: input.passwordKdfSalt,
          passwordKdfParamsVersion: input.passwordKdfParamsVersion,
          deviceFingerprint: input.deviceFingerprint.trim().toLowerCase(),
          deviceName: input.deviceName.trim().slice(0, 255) || "Unknown device",
          devicePublicKey: input.devicePublicKey.trim(),
          deviceShare: input.deviceShare,
          platform: input.platform,
          osName: input.osName,
          osVersion: input.osVersion,
          appVersion: input.appVersion,
          clientType: input.clientType,
          userAgent: input.userAgent,
          requestIp: input.requestIp,
          nowIso,
          personalWorkspaceName: input.personalWorkspaceName,
          personalVaultName: input.personalVaultName,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          planTier: this.config.defaultWorkspacePlanTier,
        });
      });

      const session = await this.sessionService.createSession(bundle.userId, {
        ttlSeconds: this.config.registrationBootstrapSessionTtlSeconds,
        scope: SESSION_SCOPE_REGISTRATION_RECOVERY,
        deviceId: bundle.deviceId,
      });

      const cachedIds: RegisterCompleteCachedIds = {
        userId: bundle.userId,
        workspaceId: bundle.workspaceId,
        vaultId: bundle.vaultId,
        deviceId: bundle.deviceId,
        deviceStatus: "trusted",
      };

      // Persist public ids only — never cache the bootstrap bearer.
      await this.redis.setWithTtl(
        registrationResultRedisKey(input.authStateId),
        JSON.stringify(cachedIds),
        this.config.registrationResultTtlSeconds,
      );
      await this.authService.removeAuthState(input.authStateId);

      this.log?.info("registration.complete", {
        event: "registration_bootstrap_session_minted",
        user_id: bundle.userId,
        device_id: bundle.deviceId,
        scope: SESSION_SCOPE_REGISTRATION_RECOVERY,
        expires_at: session.expiresAt,
        request_ip: input.requestIp,
      });

      recordCryptoOperationOutcome(this.log, {
        operation: "registration.complete",
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "success",
      });

      return {
        ...cachedIds,
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        tokenType: "Bearer",
        scope: SESSION_SCOPE_REGISTRATION_RECOVERY,
      };
    } catch (error) {
      recordCryptoOperationOutcome(this.log, {
        operation: "registration.complete",
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "error",
        code: error instanceof RegistrationError ? error.code : "UNEXPECTED",
      });
      if (isPgUniqueViolation(error)) {
        throw new RegistrationError(
          "REGISTRATION_CONFLICT",
          409,
          "registration conflict",
        );
      }
      throw error;
    } finally {
      stopTimer();
    }
  }

  private validateCryptoPayload(input: RegisterCompleteInput): void {
    try {
      assertOpaqueSplitKeyShare(input.serverKeyShare, "server_key_share");
      assertOpaqueSplitKeyShare(input.deviceShare, "device_share");
    } catch (error: unknown) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        error instanceof Error ? error.message : "invalid split-key share",
      );
    }
    if (input.passwordKdfSalt.length !== KDF_SALT_LEN) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "password_kdf_salt must be 16 bytes",
      );
    }
    if (!SUPPORTED_KDF_PARAMS_VERSIONS.has(input.passwordKdfParamsVersion)) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "unsupported password_kdf_params_version",
      );
    }
    const kdfPolicyViolation = getCryptoWritePolicyViolation(
      this.config,
      input.passwordKdfParamsVersion,
    );
    if (kdfPolicyViolation) {
      logCryptoPolicyViolation(this.log, {
        reason: "policy",
        deployEnv: this.config.deployEnv,
        requestedVersion: input.passwordKdfParamsVersion,
      });
      throw new RegistrationError(
        kdfPolicyViolation.code,
        kdfPolicyViolation.statusCode,
        kdfPolicyViolation.message,
        kdfPolicyViolation.details,
      );
    }

    const pkBytes = decodeBase64Key(input.userPublicKey, "user_public_key");
    if (pkBytes.length !== ED25519_PK_LEN) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "user_public_key must decode to 32 bytes",
      );
    }

    const pqBytes = decodeBase64Key(input.userPublicPqKey, "user_public_pq_key");
    if (pqBytes.length !== MLKEM768_EK_LEN) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "user_public_pq_key must decode to 1184 bytes (ML-KEM-768)",
      );
    }
    const capabilityDecision = evaluateCapabilityDecision({
      mode: this.config.cryptoRolloutMode,
      operation: "registration.complete",
      requirements: [
        { subject: "user", capability: "pq_identity", present: pqBytes.length === MLKEM768_EK_LEN },
        { subject: "device", capability: "pq_device", present: input.deviceCryptoCapable === true },
      ],
    });
    recordCapabilityDecision(this.log, {
      operation: "registration.complete",
      mode: capabilityDecision.mode,
      allowed: capabilityDecision.allowed,
      deployEnv: this.config.deployEnv,
      subject: "user",
    });
    recordCapabilityDecision(this.log, {
      operation: "registration.complete",
      mode: capabilityDecision.mode,
      allowed: capabilityDecision.allowed,
      deployEnv: this.config.deployEnv,
      subject: "device",
    });
    if (!capabilityDecision.allowed) {
      logCryptoPolicyViolation(this.log, {
        reason: "capability",
        deployEnv: this.config.deployEnv,
        requestedVersion: input.passwordKdfParamsVersion,
        rolloutMode: capabilityDecision.mode,
        missingCapabilities: capabilityDecision.missing,
      });
      throw new RegistrationError(
        CRYPTO_CAPABILITY_REQUIRED,
        CRYPTO_CAPABILITY_REQUIRED_STATUS_CODE,
        "strict rollout mode requires PQ-capable user/device",
        buildCapabilityPolicyDetails({
          mode: capabilityDecision.mode,
          operation: "registration.complete",
          missing: capabilityDecision.missing,
        }),
      );
    }

    if (!isValidFingerprint(input.deviceFingerprint)) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "invalid device_fingerprint",
      );
    }
    if (!isValidBase64NonEmpty(input.devicePublicKey)) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "invalid device_public_key",
      );
    }
  }

  private validateEncryptedPrivateKey(value: EncryptedBlob): EncryptedBlob {
    let parsed: ReturnType<typeof parseEncryptedBlobInput>;
    try {
      parsed = parseEncryptedBlobInput(value, {
        fieldName: "encrypted_private_key",
        maxPayloadBytes: 1024 * 1024,
        allowLegacyString: false,
      });
    } catch (error) {
      throw new RegistrationError("CRYPTO_PAYLOAD_INVALID", 400, (error as Error).message);
    }
    if (parsed.payloadBytes.length < MIN_ENCRYPTED_USER_IDENTITY_PAYLOAD_LEN) {
      throw new RegistrationError("CRYPTO_PAYLOAD_INVALID", 400, "encrypted_private_key too short");
    }
    const blobPolicyViolation = getCryptoWritePolicyViolation(
      this.config,
      parsed.blob.crypto_version,
    );
    if (blobPolicyViolation) {
      logCryptoPolicyViolation(this.log, {
        reason: "policy",
        deployEnv: this.config.deployEnv,
        requestedVersion: parsed.blob.crypto_version,
      });
      throw new RegistrationError(
        blobPolicyViolation.code,
        blobPolicyViolation.statusCode,
        blobPolicyViolation.message,
        blobPolicyViolation.details,
      );
    }
    return mergeEncryptedBlobMeta(parsed.blob, {
      entity: "user_private_key_bundle",
      bundle_version: 2,
      identity: "ed25519_mlkem768_v1",
      key_scope: "account",
    });
  }
}

function decodeBase64Key(value: string, label: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new RegistrationError("CRYPTO_PAYLOAD_INVALID", 400, `${label} is empty`);
  }
  try {
    return Uint8Array.from(Buffer.from(trimmed, "base64"));
  } catch {
    throw new RegistrationError("CRYPTO_PAYLOAD_INVALID", 400, `${label} is not valid base64`);
  }
}

function isValidFingerprint(value: string): boolean {
  const trimmed = value.trim();
  // Legacy random hex (32–128 chars).
  if (/^[a-f0-9]{32,128}$/i.test(trimmed)) {
    return true;
  }
  // Structured: web_app-chrome-macos-14.5 (no IP/geo).
  return /^(web_app|mobile_app|desktop_app|extension)-[a-z0-9]+-[a-z0-9]+-[a-z0-9.]+$/i.test(
    trimmed,
  );
}

function isPgUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code: string }).code === "23505";
  }
  if (typeof error === "object" && error !== null && "cause" in error) {
    return isPgUniqueViolation((error as { cause: unknown }).cause);
  }
  return false;
}

function isValidBase64NonEmpty(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length % 4 !== 0) {
    return false;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return false;
  }
  try {
    return Buffer.from(trimmed, "base64").length > 0;
  } catch {
    return false;
  }
}
