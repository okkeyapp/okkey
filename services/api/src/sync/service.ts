import {
  CRYPTO_DOWNGRADE_NOT_ALLOWED,
  CRYPTO_DOWNGRADE_STATUS_CODE,
  buildCryptoDowngradeDetails,
} from "../crypto/downgrade.ts";
import { logCryptoPolicyViolation } from "../crypto/policy-log.ts";
import {
  CRYPTO_POLICY_VIOLATION,
  CRYPTO_POLICY_VIOLATION_STATUS_CODE,
  buildCryptoPolicyDetails,
  isCryptoProfileAllowed,
} from "../crypto/policy.ts";
import type { Logger } from "../logger.ts";
import { CryptoDowngradeInvariantError, VersionConflictError } from "../storage/errors.ts";
import type { EventRecord, EventsRepository, VaultsRepository } from "../storage/repositories.ts";
import type { ApiConfig } from "../config.ts";
import {
  decodeEncryptedBlobFromStorage,
  mergeEncryptedBlobMeta,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
  type EncryptedBlob,
} from "../crypto/encrypted-blob.ts";

const SYNC_EVENT_TYPES = new Set([
  "ITEM_CREATE",
  "ITEM_UPDATE",
  "ITEM_DELETE",
  "FOLDER_CREATE",
  "FOLDER_UPDATE",
  "FOLDER_DELETE",
  "ITEM_FOLDER_ASSIGN",
  "VAULT_CREATE",
  "VAULT_SHARE",
  "VAULT_KEY_ROTATION",
  "DEVICE_ADD",
  "DEVICE_REMOVE",
]);

const EVENT_TYPES_REQUIRING_IDEMPOTENCY = new Set(["ITEM_CREATE", "FOLDER_CREATE"]);

/** Max decoded ciphertext size per event (DoS guard). */
export const SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES = 512 * 1024;

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export class SyncServiceError extends Error {
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

export interface SyncServiceDeps {
  vaults: Pick<VaultsRepository, "findById" | "canReadVault">;
  events: Pick<EventsRepository, "listAfterVersion" | "append">;
  config?: Pick<ApiConfig, "allowedCryptoProfileVersions" | "deployEnv">;
  log?: Logger;
}

export interface SyncEventResponse {
  id: string;
  vaultId: string;
  actorId: string | null;
  eventType: string;
  encryptedBlob: EncryptedBlob;
  idempotencyKey: string | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}

export interface SyncAppendEventInput {
  eventType: string;
  encryptedBlob: unknown;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export class SyncService {
  private readonly vaults: SyncServiceDeps["vaults"];
  private readonly events: SyncServiceDeps["events"];
  private readonly config: Pick<ApiConfig, "allowedCryptoProfileVersions" | "deployEnv">;
  private readonly log: Logger | undefined;

  constructor(deps: SyncServiceDeps) {
    this.vaults = deps.vaults;
    this.events = deps.events;
    this.config = deps.config ?? { allowedCryptoProfileVersions: [1, 2], deployEnv: "dev" };
    this.log = deps.log;
  }

  async listEvents(
    vaultId: string,
    userId: string,
    afterVersion: number,
  ): Promise<SyncEventResponse[]> {
    if (!Number.isInteger(afterVersion) || afterVersion < 0) {
      throw new SyncServiceError(
        "SYNC_BAD_REQUEST",
        400,
        "afterVersion must be a non-negative integer",
      );
    }

    await this.ensureVaultReadable(vaultId, userId);
    const events = await this.events.listAfterVersion(vaultId, afterVersion);
    return events.map(mapEventToResponse);
  }

  async appendEvent(
    vaultId: string,
    userId: string,
    input: SyncAppendEventInput,
  ): Promise<SyncEventResponse> {
    await this.ensureVaultReadable(vaultId, userId);

    if (!SYNC_EVENT_TYPES.has(input.eventType)) {
      throw new SyncServiceError("SYNC_INVALID_EVENT_TYPE", 400, "invalid eventType");
    }
    if (!Number.isInteger(input.baseVersion) || input.baseVersion < 0) {
      throw new SyncServiceError(
        "SYNC_BAD_REQUEST",
        400,
        "baseVersion must be a non-negative integer",
      );
    }

    let parsedBlob: ReturnType<typeof parseEncryptedBlobInput>;
    try {
      parsedBlob = parseEncryptedBlobInput(input.encryptedBlob, {
        fieldName: "encryptedBlob",
        maxPayloadBytes: SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES,
        allowLegacyString: false,
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("exceeds")) {
        throw new SyncServiceError("PAYLOAD_TOO_LARGE", 413, message);
      }
      throw new SyncServiceError("SYNC_BAD_REQUEST", 400, message);
    }
    const normalizedBlob = mergeEncryptedBlobMeta(parsedBlob.blob, {
      entity: "sync_event",
      event_type: input.eventType,
    });
    if (!isCryptoProfileAllowed(this.config, normalizedBlob.crypto_version)) {
      logCryptoPolicyViolation(this.log, {
        reason: "policy",
        deployEnv: this.config.deployEnv ?? "dev",
        vaultId,
        actorId: userId,
        requestedVersion: normalizedBlob.crypto_version,
      });
      throw new SyncServiceError(
        CRYPTO_POLICY_VIOLATION,
        CRYPTO_POLICY_VIOLATION_STATUS_CODE,
        `crypto profile v${normalizedBlob.crypto_version} is not allowed by policy`,
        buildCryptoPolicyDetails(this.config, normalizedBlob.crypto_version),
      );
    }

    if (EVENT_TYPES_REQUIRING_IDEMPOTENCY.has(input.eventType)) {
      if (!input.idempotencyKey) {
        throw new SyncServiceError(
          "SYNC_BAD_REQUEST",
          400,
          "idempotencyKey is required for this eventType",
        );
      }
    }

    if (input.idempotencyKey !== undefined && input.idempotencyKey !== "") {
      if (!isUuid(input.idempotencyKey)) {
        throw new SyncServiceError(
          "SYNC_BAD_REQUEST",
          400,
          "idempotencyKey must be a UUID",
        );
      }
    }

    let clientCreatedAt: string | null = null;
    if (input.clientCreatedAt !== undefined && input.clientCreatedAt !== "") {
      const parsed = Date.parse(input.clientCreatedAt);
      if (Number.isNaN(parsed)) {
        throw new SyncServiceError(
          "SYNC_BAD_REQUEST",
          400,
          "clientCreatedAt must be a valid ISO-8601 date-time string",
        );
      }
      clientCreatedAt = new Date(parsed).toISOString();
    }

    try {
      const created = await this.events.append({
        vaultId,
        actorId: userId,
        eventType: input.eventType,
        encryptedPayload: serializeEncryptedBlobToStorage(normalizedBlob),
        baseVersion: input.baseVersion,
        payloadSchemaVersion: normalizedBlob.crypto_version,
        idempotencyKey: input.idempotencyKey,
        clientCreatedAt: clientCreatedAt ?? undefined,
      });
      return mapEventToResponse(created);
    } catch (error) {
      if (error instanceof VersionConflictError) {
        throw new SyncServiceError(
          "VERSION_MISMATCH",
          409,
          "baseVersion is stale",
          {
            expectedBaseVersion: error.expectedVersion,
            latestVersion: error.actualVersion,
          },
        );
      }
      if (error instanceof CryptoDowngradeInvariantError) {
        logCryptoPolicyViolation(this.log, {
          reason: "downgrade",
          deployEnv: this.config.deployEnv ?? "dev",
          vaultId,
          actorId: userId,
          requestedVersion: error.requestedVersion,
          establishedMaxVersion: error.establishedMaxVersion,
        });
        throw new SyncServiceError(
          CRYPTO_DOWNGRADE_NOT_ALLOWED,
          CRYPTO_DOWNGRADE_STATUS_CODE,
          `crypto profile downgrade blocked: vault stream requires at least v${error.establishedMaxVersion}`,
          buildCryptoDowngradeDetails(
            vaultId,
            error.establishedMaxVersion,
            error.requestedVersion,
          ),
        );
      }
      throw error;
    }
  }

  private async ensureVaultReadable(vaultId: string, userId: string): Promise<void> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new SyncServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new SyncServiceError("ACCESS_DENIED", 403, "access denied");
    }
  }
}

function mapEventToResponse(event: EventRecord): SyncEventResponse {
  const encryptedBlob = decodeEncryptedBlobFromStorage(event.encryptedPayload, event.payloadSchemaVersion);
  return {
    id: event.id,
    vaultId: event.vaultId,
    actorId: event.actorId,
    eventType: event.eventType,
    encryptedBlob,
    encryptedPayload: encryptedBlob.payload,
    payloadSchemaVersion: encryptedBlob.crypto_version,
    idempotencyKey: event.idempotencyKey,
    clientCreatedAt: event.clientCreatedAt,
    version: event.version,
    createdAt: event.createdAt,
  } as SyncEventResponse;
}
