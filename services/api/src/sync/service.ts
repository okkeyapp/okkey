import {
  CRYPTO_CAPABILITY_REQUIRED,
  CRYPTO_CAPABILITY_REQUIRED_STATUS_CODE,
  buildCapabilityPolicyDetails,
  evaluateCapabilityDecision,
} from "../crypto/capability-policy.ts";
import {
  CRYPTO_DOWNGRADE_NOT_ALLOWED,
  CRYPTO_DOWNGRADE_STATUS_CODE,
  buildCryptoDowngradeDetails,
} from "../crypto/downgrade.ts";
import { getCryptoRolloutGateViolation } from "../crypto/rollout-gates.ts";
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
import { CryptoDowngradeInvariantError, VersionConflictError } from "../storage/errors.ts";
import type { EventRecord, EventsRepository, VaultsRepository } from "../storage/repositories.ts";
import type { UsersRepository } from "../storage/repositories.ts";
import type { ApiConfig } from "../config.ts";
import {
  decodeEncryptedBlobFromStorage,
  mergeEncryptedBlobMeta,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
  type EncryptedBlob,
} from "../crypto/encrypted-blob.ts";
import {
  SIGNATURE_INVALID,
  SIGNATURE_REQUIRED,
  SIGNATURE_STATUS_CODE,
  parseHybridSignatureEnvelope,
  verifyHybridSignatureForPayload,
} from "../crypto/hybrid-signature.ts";
import { isEntityId } from "../entity-id.ts";

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
const EVENT_TYPES_REQUIRING_SIGNATURE = new Set(["VAULT_SHARE", "VAULT_KEY_ROTATION"]);

/** Max decoded ciphertext size per event (DoS guard). */
export const SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES = 512 * 1024;

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
  users?: Pick<UsersRepository, "findById">;
  config?: Partial<
    Pick<
      ApiConfig,
      | "allowedCryptoProfileVersions"
      | "deployEnv"
      | "cryptoRolloutMode"
      | "cryptoRolloutEnabled"
      | "cryptoRolloutState"
      | "cryptoRolloutStopWritePaths"
    >
  >;
  log?: Logger;
}

export interface SyncEventResponse {
  id: string;
  vaultId: string;
  actorId: string | null;
  eventType: string;
  encryptedBlob: EncryptedBlob;
  signature?: unknown;
  idempotencyKey: string | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}

export interface SyncAppendEventInput {
  eventType: string;
  encryptedBlob: unknown;
  signature?: unknown;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export class SyncService {
  private readonly vaults: SyncServiceDeps["vaults"];
  private readonly events: SyncServiceDeps["events"];
  private readonly users: SyncServiceDeps["users"];
  private readonly config: Pick<
    ApiConfig,
    | "allowedCryptoProfileVersions"
    | "deployEnv"
    | "cryptoRolloutMode"
    | "cryptoRolloutEnabled"
    | "cryptoRolloutState"
    | "cryptoRolloutStopWritePaths"
  >;
  private readonly log: Logger | undefined;

  constructor(deps: SyncServiceDeps) {
    this.vaults = deps.vaults;
    this.events = deps.events;
    this.users = deps.users;
    this.config = {
      allowedCryptoProfileVersions: [1, 2],
      deployEnv: "dev",
      cryptoRolloutMode: "compat",
      cryptoRolloutEnabled: true,
      cryptoRolloutState: "resume",
      cryptoRolloutStopWritePaths: [],
      ...deps.config,
    };
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
    const operation = "sync.append";
    const stopTimer = startCryptoOperationTimer(this.log, {
      operation,
      deployEnv: this.config.deployEnv,
      rolloutMode: this.config.cryptoRolloutMode,
    });
    const rolloutGateViolation = getCryptoRolloutGateViolation(this.config, operation);
    if (rolloutGateViolation) {
      recordCryptoOperationOutcome(this.log, {
        operation,
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "blocked",
        code: rolloutGateViolation.code,
      });
      stopTimer();
      throw new SyncServiceError(
        rolloutGateViolation.code,
        rolloutGateViolation.statusCode,
        rolloutGateViolation.message,
        rolloutGateViolation.details,
      );
    }
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
    const signatureIsRequired =
      EVENT_TYPES_REQUIRING_SIGNATURE.has(input.eventType) &&
      this.config.cryptoRolloutMode === "strict";
    if (EVENT_TYPES_REQUIRING_SIGNATURE.has(input.eventType) && (input.signature || signatureIsRequired)) {
      if (!input.signature) {
        throw new SyncServiceError(
          SIGNATURE_REQUIRED,
          SIGNATURE_STATUS_CODE,
          "signature is required for this eventType",
          { context: "sync.append", eventType: input.eventType },
        );
      }
      const actor = this.users ? await this.users.findById(userId) : null;
      if (!actor?.publicKey || !actor.publicPqKey) {
        throw new SyncServiceError(
          SIGNATURE_INVALID,
          SIGNATURE_STATUS_CODE,
          "signer keys are unavailable",
          { context: "sync.append", eventType: input.eventType },
        );
      }
      let envelope;
      try {
        envelope = parseHybridSignatureEnvelope(input.signature, "sync.append");
      } catch (error) {
        throw new SyncServiceError(
          SIGNATURE_INVALID,
          SIGNATURE_STATUS_CODE,
          (error as Error).message,
          { context: "sync.append", eventType: input.eventType },
        );
      }
      if (envelope.signer_pq_public_key !== actor.publicPqKey) {
        throw new SyncServiceError(
          SIGNATURE_INVALID,
          SIGNATURE_STATUS_CODE,
          "signature signer_pq_public_key mismatch",
          { context: "sync.append", eventType: input.eventType },
        );
      }
      const verified = verifyHybridSignatureForPayload({
        envelope,
        payload: {
          vaultId,
          eventType: input.eventType,
          encryptedBlob: normalizedBlob,
        },
        signerPublicKeyBase64: actor.publicKey,
      });
      if (!verified) {
        throw new SyncServiceError(
          SIGNATURE_INVALID,
          SIGNATURE_STATUS_CODE,
          "signature verification failed",
          { context: "sync.append", eventType: input.eventType },
        );
      }
      normalizedBlob.meta = {
        ...normalizedBlob.meta,
        signature: envelope,
      };
    }
    const policyViolation = getCryptoWritePolicyViolation(
      this.config,
      normalizedBlob.crypto_version,
    );
    if (policyViolation) {
      logCryptoPolicyViolation(this.log, {
        reason: "policy",
        deployEnv: this.config.deployEnv ?? "dev",
        vaultId,
        actorId: userId,
        requestedVersion: normalizedBlob.crypto_version,
      });
      throw new SyncServiceError(
        policyViolation.code,
        policyViolation.statusCode,
        policyViolation.message,
        policyViolation.details,
      );
    }
    await this.assertActorCapabilityForWrite(
      userId,
      "sync.append",
      normalizedBlob.crypto_version,
    );

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
      if (!isEntityId(input.idempotencyKey)) {
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
      recordCryptoOperationOutcome(this.log, {
        operation,
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "success",
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
      recordCryptoOperationOutcome(this.log, {
        operation,
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "error",
        code: error instanceof SyncServiceError ? error.code : "UNEXPECTED",
      });
      throw error;
    } finally {
      stopTimer();
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

  private async assertActorCapabilityForWrite(
    actorId: string,
    operation: string,
    requestedVersion: number,
  ): Promise<void> {
    const user = this.users ? await this.users.findById(actorId) : null;
    const capabilityDecision = evaluateCapabilityDecision({
      mode: this.config.cryptoRolloutMode,
      operation,
      requirements: [
        { subject: "user", capability: "pq_identity", present: Boolean(user?.publicPqKey) },
      ],
    });
    recordCapabilityDecision(this.log, {
      operation,
      mode: capabilityDecision.mode,
      allowed: capabilityDecision.allowed,
      deployEnv: this.config.deployEnv,
      subject: "user",
    });
    if (capabilityDecision.allowed) {
      return;
    }
    logCryptoPolicyViolation(this.log, {
      reason: "capability",
      deployEnv: this.config.deployEnv ?? "dev",
      actorId,
      requestedVersion,
      rolloutMode: capabilityDecision.mode,
      missingCapabilities: capabilityDecision.missing,
    });
    throw new SyncServiceError(
      CRYPTO_CAPABILITY_REQUIRED,
      CRYPTO_CAPABILITY_REQUIRED_STATUS_CODE,
      "strict rollout mode requires PQ-capable actor",
      buildCapabilityPolicyDetails({
        mode: capabilityDecision.mode,
        operation,
        missing: capabilityDecision.missing,
        subjectId: actorId,
      }),
    );
  }
}

function mapEventToResponse(event: EventRecord): SyncEventResponse {
  const encryptedBlob = decodeEncryptedBlobFromStorage(event.encryptedPayload, event.payloadSchemaVersion);
  const signature =
    encryptedBlob.meta &&
    typeof encryptedBlob.meta === "object" &&
    !Array.isArray(encryptedBlob.meta)
      ? encryptedBlob.meta.signature
      : undefined;
  return {
    id: event.id,
    vaultId: event.vaultId,
    actorId: event.actorId,
    eventType: event.eventType,
    encryptedBlob,
    signature,
    encryptedPayload: encryptedBlob.payload,
    payloadSchemaVersion: encryptedBlob.crypto_version,
    idempotencyKey: event.idempotencyKey,
    clientCreatedAt: event.clientCreatedAt,
    version: event.version,
    createdAt: event.createdAt,
  } as SyncEventResponse;
}
