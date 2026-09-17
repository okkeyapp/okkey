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
import type { PostgresDatabase } from "../storage/postgres.ts";
import type { UsersRepository } from "../storage/repositories.ts";
import { insertRegistrationBundle } from "./repository.ts";

const SHARE_LEN = 32;
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
  /** When set, used as workspace and personal vault name instead of default "Personal". */
  personalWorkspaceName?: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface RegisterCompleteResult {
  userId: string;
  workspaceId: string;
  vaultId: string;
  deviceId: string;
  deviceStatus: "trusted";
  accessToken: string;
  expiresAt: string;
  tokenType: "Bearer";
}

export interface RegistrationServiceDeps {
  authService: AuthService;
  users: Pick<UsersRepository, "findByEmail">;
  postgres: PostgresDatabase;
  redis: {
    get(key: string): Promise<string | null>;
    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<number>;
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

  /** Idempotent cache may omit session fields (older entries); mint a session when missing. */
  private async ensureSessionOnRegisterResult(
    base: Omit<RegisterCompleteResult, "accessToken" | "expiresAt" | "tokenType"> &
      Partial<Pick<RegisterCompleteResult, "accessToken" | "expiresAt" | "tokenType">>,
  ): Promise<RegisterCompleteResult> {
    if (
      base.accessToken &&
      base.expiresAt &&
      base.tokenType === "Bearer"
    ) {
      return base as RegisterCompleteResult;
    }
    const session = await this.sessionService.createSession(base.userId);
    return {
      userId: base.userId,
      workspaceId: base.workspaceId,
      vaultId: base.vaultId,
      deviceId: base.deviceId,
      deviceStatus: base.deviceStatus,
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      tokenType: "Bearer",
    };
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
    const cached = await this.redis.get(registrationResultRedisKey(input.authStateId));
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as RegisterCompleteResult;
        if (
          parsed.userId &&
          parsed.workspaceId &&
          parsed.vaultId &&
          parsed.deviceId &&
          parsed.deviceStatus === "trusted"
        ) {
          recordCryptoOperationOutcome(this.log, {
            operation: "registration.complete",
            deployEnv: this.config.deployEnv,
            rolloutMode: this.config.cryptoRolloutMode,
            outcome: "success",
          });
          stopTimer();
          return await this.ensureSessionOnRegisterResult(parsed);
        }
      } catch {
        /* fall through */
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
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          planTier: this.config.defaultWorkspacePlanTier,
        });
      });

      const session = await this.sessionService.createSession(bundle.userId);
      const result: RegisterCompleteResult = {
        userId: bundle.userId,
        workspaceId: bundle.workspaceId,
        vaultId: bundle.vaultId,
        deviceId: bundle.deviceId,
        deviceStatus: "trusted",
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        tokenType: "Bearer",
      };

      await this.redis.setWithTtl(
        registrationResultRedisKey(input.authStateId),
        JSON.stringify(result),
        this.config.registrationResultTtlSeconds,
      );
      await this.authService.removeAuthState(input.authStateId);

      recordCryptoOperationOutcome(this.log, {
        operation: "registration.complete",
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "success",
      });
      return result;
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
    if (input.serverKeyShare.length !== SHARE_LEN) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "server_key_share must be 32 bytes",
      );
    }
    if (input.deviceShare.length !== SHARE_LEN) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "device_share must be 32 bytes",
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
