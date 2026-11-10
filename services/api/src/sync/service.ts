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
import type {
  EventRecord,
  EventsRepository,
  VaultRecord,
  VaultsRepository,
  WorkspacesRepository,
} from "../storage/repositories.ts";
import type { VaultItemSoftDeletesRepository } from "../storage/vault-item-soft-deletes.ts";
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
  enforceOperationSignature,
  OperationSignatureError,
} from "../crypto/signature-requirement.ts";
import { isEntityId } from "../entity-id.ts";
import { type PlanEntitlementRuntimeConfig } from "../plan-entitlements.ts";
import {
  PlanQuotaExceededError,
  type WorkspaceStorageQuotaService,
} from "../storage-quota/service.ts";
import { evaluateSharedVaultItemCreateGate } from "./shared-vault-item-create-gate.ts";

const SYNC_EVENT_TYPES = new Set([
  "ITEM_CREATE",
  "ITEM_UPDATE",
  "ITEM_DELETE",
  "VAULT_CREATE",
  "VAULT_SHARE",
  "VAULT_KEY_ROTATION",
  "DEVICE_ADD",
  "DEVICE_REMOVE",
]);

const EVENT_TYPES_REQUIRING_IDEMPOTENCY = new Set(["ITEM_CREATE"]);

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
  events: Pick<
    EventsRepository,
    | "listAfterVersion"
    | "append"
    | "deleteByVaultAndReferencedItemId"
    | "hasItemCreateEvent"
    | "findByIdempotencyKey"
  >;
  softDeletes?: Pick<VaultItemSoftDeletesRepository, "upsert" | "remove">;
  users?: Pick<UsersRepository, "findById">;
  /** Required in production to gate ITEM_CREATE on shared vaults after EE→FREE. */
  workspaces?: Pick<WorkspacesRepository, "findById">;
  /** When set, SaaS item writes are rejected once encrypted content exceeds the plan ceiling. */
  storageQuota?: WorkspaceStorageQuotaService;
  config?: Partial<
    Pick<
      ApiConfig,
      | "allowedCryptoProfileVersions"
      | "deployEnv"
      | "cryptoRolloutMode"
      | "cryptoRolloutEnabled"
      | "cryptoRolloutState"
      | "cryptoRolloutStopWritePaths"
      | "deploymentMode"
      | "enterpriseModulesEnabled"
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
  referencedItemId?: string | null;
  itemSoftDeleted?: boolean | null;
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
  referencedItemId?: string;
  itemSoftDeleted?: boolean;
  itemDeletedAtMs?: number;
}

export class SyncService {
  private readonly vaults: SyncServiceDeps["vaults"];
  private readonly events: SyncServiceDeps["events"];
  private readonly softDeletes: SyncServiceDeps["softDeletes"];
  private readonly users: SyncServiceDeps["users"];
  private readonly workspaces: SyncServiceDeps["workspaces"];
  private readonly storageQuota: SyncServiceDeps["storageQuota"];
  private readonly config: Pick<
    ApiConfig,
    | "allowedCryptoProfileVersions"
    | "deployEnv"
    | "cryptoRolloutMode"
    | "cryptoRolloutEnabled"
    | "cryptoRolloutState"
    | "cryptoRolloutStopWritePaths"
    | "deploymentMode"
    | "enterpriseModulesEnabled"
  >;
  private readonly log: Logger | undefined;

  constructor(deps: SyncServiceDeps) {
    this.vaults = deps.vaults;
    this.events = deps.events;
    this.softDeletes = deps.softDeletes;
    this.users = deps.users;
    this.workspaces = deps.workspaces;
    this.storageQuota = deps.storageQuota;
    this.config = {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "compat",
      cryptoRolloutEnabled: true,
      cryptoRolloutState: "resume",
      cryptoRolloutStopWritePaths: [],
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
      ...deps.config,
    };
    this.log = deps.log;
  }

  async listEvents(
    vaultId: string,
    userId: string,
    afterVersion: number,
  ): Promise<SyncEventResponse[]> {
    if (!isEntityId(vaultId.trim())) {
      throw new SyncServiceError("INVALID_VAULT_ID", 400, "vaultId must be a snowflake entity id");
    }
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
    if (!isEntityId(vaultId.trim())) {
      throw new SyncServiceError("INVALID_VAULT_ID", 400, "vaultId must be a snowflake entity id");
    }
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
    const vault = await this.ensureVaultReadable(vaultId, userId);

    if (!SYNC_EVENT_TYPES.has(input.eventType)) {
      throw new SyncServiceError("SYNC_INVALID_EVENT_TYPE", 400, "invalid eventType");
    }
    if (input.eventType === "ITEM_CREATE") {
      await this.assertSharedVaultItemCreateAllowed(vault);
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
    const actor = input.signature && this.users ? await this.users.findById(userId) : null;
    try {
      const envelope = enforceOperationSignature({
        rolloutMode: this.config.cryptoRolloutMode,
        operation: "sync.append",
        eventType: input.eventType,
        signature: input.signature,
        payload: {
          vaultId,
          eventType: input.eventType,
          encryptedBlob: normalizedBlob,
        },
        signer:
          actor?.publicKey && actor.publicPqKey
            ? {
                publicKey: actor.publicKey,
                publicPqKey: actor.publicPqKey,
                publicMldsaKey: actor.publicMldsaKey ?? null,
              }
            : null,
      });
      if (envelope) {
        normalizedBlob.meta = {
          ...normalizedBlob.meta,
          signature: envelope,
        };
      }
    } catch (error) {
      if (error instanceof OperationSignatureError) {
        throw new SyncServiceError(error.code, error.statusCode, error.message, error.details);
      }
      throw error;
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

    const itemEventTypes = new Set(["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"]);
    let referencedItemId: string | null = null;
    if (input.referencedItemId !== undefined && input.referencedItemId !== "") {
      if (!isEntityId(input.referencedItemId)) {
        throw new SyncServiceError(
          "SYNC_BAD_REQUEST",
          400,
          "referencedItemId must be a snowflake entity id",
        );
      }
      referencedItemId = input.referencedItemId;
    } else if (itemEventTypes.has(input.eventType)) {
      throw new SyncServiceError(
        "SYNC_BAD_REQUEST",
        400,
        "referencedItemId is required for item events",
      );
    }

    if (input.eventType === "ITEM_CREATE" && referencedItemId) {
      const alreadyCreated = await this.events.hasItemCreateEvent(
        vaultId,
        referencedItemId,
      );
      if (alreadyCreated) {
        // Same-key retries must keep returning the original create (append short-circuit).
        if (input.idempotencyKey) {
          const existingByKey = await this.events.findByIdempotencyKey(
            vaultId,
            input.idempotencyKey,
          );
          if (
            existingByKey &&
            existingByKey.eventType === "ITEM_CREATE" &&
            existingByKey.referencedItemId === referencedItemId
          ) {
            return mapEventToResponse(existingByKey);
          }
        }
        throw new SyncServiceError(
          "SYNC_ITEM_ALREADY_EXISTS",
          409,
          "ITEM_CREATE already exists for this item id",
          { referencedItemId },
        );
      }
    }

    if (
      (input.eventType === "ITEM_UPDATE" || input.eventType === "ITEM_DELETE") &&
      referencedItemId
    ) {
      const hasCreate = await this.events.hasItemCreateEvent(vaultId, referencedItemId);
      if (!hasCreate) {
        throw new SyncServiceError(
          "SYNC_ITEM_NOT_FOUND",
          404,
          "ITEM_UPDATE/ITEM_DELETE require an existing ITEM_CREATE for this item id",
          { referencedItemId },
        );
      }
    }

    if (input.itemSoftDeleted === true) {
      if (
        input.itemDeletedAtMs === undefined ||
        !Number.isFinite(input.itemDeletedAtMs) ||
        input.itemDeletedAtMs <= 0
      ) {
        throw new SyncServiceError(
          "SYNC_BAD_REQUEST",
          400,
          "itemDeletedAtMs is required when itemSoftDeleted is true",
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

    // Always persist an explicit boolean for ITEM_* events (never leave unset on new rows).
    // Omitted UPDATE/CREATE hints default to false; ITEM_DELETE is always soft-delete.
    let itemSoftDeleted: boolean | null = null;
    if (itemEventTypes.has(input.eventType)) {
      itemSoftDeleted =
        input.eventType === "ITEM_DELETE" ? true : input.itemSoftDeleted === true;
    }

    if (
      this.storageQuota &&
      (input.eventType === "ITEM_CREATE" || input.eventType === "ITEM_UPDATE") &&
      itemSoftDeleted !== true &&
      referencedItemId
    ) {
      const existingIdempotent = input.idempotencyKey
        ? await this.events.findByIdempotencyKey(vaultId, input.idempotencyKey)
        : null;
      if (!existingIdempotent) {
        const workspace = this.workspaces
          ? await this.workspaces.findById(vault.workspaceId)
          : null;
        if (workspace) {
          const nextPayloadBytes = serializeEncryptedBlobToStorage(normalizedBlob).byteLength;
          try {
            await this.storageQuota.assertVaultItemWrite({
              workspace,
              vaultId,
              referencedItemId,
              eventType: input.eventType,
              nextPayloadBytes,
            });
          } catch (error) {
            if (error instanceof PlanQuotaExceededError) {
              throw new SyncServiceError(
                error.code,
                error.statusCode,
                error.message,
                error.details,
              );
            }
            throw error;
          }
        }
      }
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
        referencedItemId,
        itemSoftDeleted,
      });
      // Drive retention index from the *persisted* event (idempotent retries may
      // return an older row). Never mark soft-delete in the index without a matching
      // item_soft_deleted / ITEM_DELETE on that event row.
      if (this.softDeletes && referencedItemId) {
        const persistedSoftDelete =
          created.eventType === "ITEM_DELETE" || created.itemSoftDeleted === true;
        if (persistedSoftDelete) {
          await this.softDeletes.upsert({
            vaultId,
            itemId: referencedItemId,
            deletedAtMs: Math.trunc(input.itemDeletedAtMs ?? Date.now()),
          });
        } else if (
          created.eventType === "ITEM_UPDATE" &&
          created.itemSoftDeleted === false
        ) {
          await this.softDeletes.remove(vaultId, referencedItemId);
        }
      }
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
            code: "VERSION_MISMATCH",
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

  private async ensureVaultReadable(vaultId: string, userId: string): Promise<VaultRecord> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new SyncServiceError("VAULT_NOT_FOUND", 404, "vault not found");
    }

    const canRead = await this.vaults.canReadVault(vaultId, userId);
    if (!canRead) {
      throw new SyncServiceError("ACCESS_DENIED", 403, "access denied");
    }
    return vault;
  }

  /**
   * When `sharedVaults` is off, existing shared vaults stay readable/editable,
   * but new items / move-into shared must be denied.
   */
  private async assertSharedVaultItemCreateAllowed(vault: VaultRecord): Promise<void> {
    if (vault.isPersonal) {
      return;
    }
    if (!this.workspaces) {
      throw new SyncServiceError(
        "PLAN_FEATURE_REQUIRED",
        403,
        "shared vaults are not available on this plan",
      );
    }
    const planConfig: PlanEntitlementRuntimeConfig = {
      deploymentMode: this.config.deploymentMode,
      enterpriseModulesEnabled: this.config.enterpriseModulesEnabled,
    };
    const workspace = await this.workspaces.findById(vault.workspaceId);
    const decision = evaluateSharedVaultItemCreateGate({
      vault,
      workspace,
      config: planConfig,
    });
    if (!decision.ok) {
      throw new SyncServiceError(decision.code, decision.statusCode, decision.message);
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
    referencedItemId: event.referencedItemId,
    itemSoftDeleted: event.itemSoftDeleted,
    version: event.version,
    createdAt: event.createdAt,
  } as SyncEventResponse;
}
