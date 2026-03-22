import type { AuthService } from "../auth/service.ts";
import type { ApiConfig } from "../config.ts";
import type { PostgresDatabase } from "../storage/postgres.ts";
import type { UsersRepository } from "../storage/repositories.ts";
import { insertRegistrationBundle } from "./repository.ts";

const SHARE_LEN = 32;
const KDF_SALT_LEN = 16;
const ED25519_PK_LEN = 32;
const MIN_ENCRYPTED_PRIVATE_LEN = 41;
const SUPPORTED_KDF_PARAMS_VERSION = 1;

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
  encryptedPrivateKey: Uint8Array;
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
}

export interface RegisterCompleteResult {
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
  };
  config: ApiConfig;
  now?: () => Date;
}

function registrationResultRedisKey(authStateId: string): string {
  return `registration:result:${authStateId}`;
}

export class RegistrationService {
  private readonly authService: AuthService;
  private readonly users: Pick<UsersRepository, "findByEmail">;
  private readonly postgres: PostgresDatabase;
  private readonly redis: RegistrationServiceDeps["redis"];
  private readonly config: ApiConfig;
  private readonly now: () => Date;

  constructor(deps: RegistrationServiceDeps) {
    this.authService = deps.authService;
    this.users = deps.users;
    this.postgres = deps.postgres;
    this.redis = deps.redis;
    this.config = deps.config;
    this.now = deps.now ?? (() => new Date());
  }

  async completeRegistration(input: RegisterCompleteInput): Promise<RegisterCompleteResult> {
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
          return parsed;
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
      const bundle = await this.postgres.transaction(async (tx) => {
        return insertRegistrationBundle(tx, {
          email: authState.email,
          publicKey: input.userPublicKey.trim(),
          encryptedPrivateKey: input.encryptedPrivateKey,
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
        });
      });

      const result: RegisterCompleteResult = {
        userId: bundle.userId,
        workspaceId: bundle.workspaceId,
        vaultId: bundle.vaultId,
        deviceId: bundle.deviceId,
        deviceStatus: "trusted",
      };

      await this.redis.setWithTtl(
        registrationResultRedisKey(input.authStateId),
        JSON.stringify(result),
        this.config.registrationResultTtlSeconds,
      );
      await this.authService.removeAuthState(input.authStateId);

      return result;
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new RegistrationError(
          "REGISTRATION_CONFLICT",
          409,
          "registration conflict",
        );
      }
      throw error;
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
    if (input.passwordKdfParamsVersion !== SUPPORTED_KDF_PARAMS_VERSION) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "unsupported password_kdf_params_version",
      );
    }
    if (input.encryptedPrivateKey.length < MIN_ENCRYPTED_PRIVATE_LEN) {
      throw new RegistrationError(
        "CRYPTO_PAYLOAD_INVALID",
        400,
        "encrypted_private_key too short",
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
  return /^[a-f0-9]{32,128}$/i.test(value.trim());
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
