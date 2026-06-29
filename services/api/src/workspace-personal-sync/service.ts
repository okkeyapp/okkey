import {
  CRYPTO_CAPABILITY_REQUIRED,
  CRYPTO_CAPABILITY_REQUIRED_STATUS_CODE,
  buildCapabilityPolicyDetails,
  evaluateCapabilityDecision,
} from "../crypto/capability-policy.ts";
import { getCryptoRolloutGateViolation } from "../crypto/rollout-gates.ts";
import { logCryptoPolicyViolation } from "../crypto/policy-log.ts";
import { getCryptoWritePolicyViolation } from "../crypto/policy.ts";
import type { Logger } from "../logger.ts";
import {
  recordCapabilityDecision,
  recordCryptoOperationOutcome,
  startCryptoOperationTimer,
} from "../observability/crypto-rollout.ts";
import { VersionConflictError } from "../storage/errors.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";
import type { UsersRepository } from "../storage/repositories.ts";
import type { WorkspacePersonalEventsRepository } from "../storage/workspace-personal-events.ts";
import type { ApiConfig } from "../config.ts";
import {
  decodeEncryptedBlobFromStorage,
  mergeEncryptedBlobMeta,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
  type EncryptedBlob,
} from "../crypto/encrypted-blob.ts";
import { isEntityId } from "../entity-id.ts";

const WORKSPACE_PERSONAL_EVENT_TYPES = new Set([
  "FOLDER_CREATE",
  "FOLDER_UPDATE",
  "FOLDER_DELETE",
  "ITEM_FOLDER_ASSIGN",
  "ITEM_FAVORITE_SET",
]);

const EVENT_TYPES_REQUIRING_IDEMPOTENCY = new Set(["FOLDER_CREATE"]);

export const WORKSPACE_PERSONAL_SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES = 512 * 1024;

export class WorkspacePersonalSyncServiceError extends Error {
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

export interface WorkspacePersonalSyncServiceDeps {
  workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  events: Pick<WorkspacePersonalEventsRepository, "listAfterVersion" | "append">;
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

export interface WorkspacePersonalEventResponse {
  id: string;
  workspaceId: string;
  actorId: string;
  eventType: string;
  encryptedBlob: EncryptedBlob;
  idempotencyKey: string | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}

export interface WorkspacePersonalAppendEventInput {
  eventType: string;
  encryptedBlob: unknown;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

function mapEventToResponse(record: {
  id: string;
  workspaceId: string;
  userId: string;
  eventType: string;
  encryptedPayload: Uint8Array;
  payloadSchemaVersion: number;
  idempotencyKey: string | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}): WorkspacePersonalEventResponse {
  const encryptedBlob = decodeEncryptedBlobFromStorage(
    record.encryptedPayload,
    record.payloadSchemaVersion,
  );
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    actorId: record.userId,
    eventType: record.eventType,
    encryptedBlob,
    idempotencyKey: record.idempotencyKey,
    clientCreatedAt: record.clientCreatedAt,
    version: record.version,
    createdAt: record.createdAt,
  };
}

export class WorkspacePersonalSyncService {
  private readonly workspaces: WorkspacePersonalSyncServiceDeps["workspaces"];
  private readonly events: WorkspacePersonalSyncServiceDeps["events"];
  private readonly users: WorkspacePersonalSyncServiceDeps["users"];
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

  constructor(deps: WorkspacePersonalSyncServiceDeps) {
    this.workspaces = deps.workspaces;
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
    workspaceId: string,
    userId: string,
    afterVersion: number,
  ): Promise<WorkspacePersonalEventResponse[]> {
    if (!Number.isInteger(afterVersion) || afterVersion < 0) {
      throw new WorkspacePersonalSyncServiceError(
        "SYNC_BAD_REQUEST",
        400,
        "afterVersion must be a non-negative integer",
      );
    }
    await this.ensureWorkspaceAccess(workspaceId, userId);
    const events = await this.events.listAfterVersion(workspaceId, userId, afterVersion);
    return events.map(mapEventToResponse);
  }

  async appendEvent(
    workspaceId: string,
    userId: string,
    input: WorkspacePersonalAppendEventInput,
  ): Promise<WorkspacePersonalEventResponse> {
    const operation = "workspace-personal-sync.append";
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
      throw new WorkspacePersonalSyncServiceError(
        rolloutGateViolation.code,
        rolloutGateViolation.statusCode,
        rolloutGateViolation.message,
        rolloutGateViolation.details,
      );
    }

    await this.ensureWorkspaceAccess(workspaceId, userId);

    if (!WORKSPACE_PERSONAL_EVENT_TYPES.has(input.eventType)) {
      throw new WorkspacePersonalSyncServiceError("SYNC_INVALID_EVENT_TYPE", 400, "invalid eventType");
    }
    if (!Number.isInteger(input.baseVersion) || input.baseVersion < 0) {
      throw new WorkspacePersonalSyncServiceError(
        "SYNC_BAD_REQUEST",
        400,
        "baseVersion must be a non-negative integer",
      );
    }

    let parsedBlob: ReturnType<typeof parseEncryptedBlobInput>;
    try {
      parsedBlob = parseEncryptedBlobInput(input.encryptedBlob, {
        fieldName: "encryptedBlob",
        maxPayloadBytes: WORKSPACE_PERSONAL_SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES,
        allowLegacyString: false,
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("exceeds")) {
        throw new WorkspacePersonalSyncServiceError("PAYLOAD_TOO_LARGE", 413, message);
      }
      throw new WorkspacePersonalSyncServiceError("SYNC_BAD_REQUEST", 400, message);
    }

    const normalizedBlob = mergeEncryptedBlobMeta(parsedBlob.blob, {
      entity: "workspace_personal_event",
      event_type: input.eventType,
    });

    const policyViolation = getCryptoWritePolicyViolation(
      this.config,
      normalizedBlob.crypto_version,
    );
    if (policyViolation) {
      logCryptoPolicyViolation(this.log, {
        reason: "policy",
        deployEnv: this.config.deployEnv ?? "dev",
        vaultId: workspaceId,
        actorId: userId,
        requestedVersion: normalizedBlob.crypto_version,
      });
      throw new WorkspacePersonalSyncServiceError(
        policyViolation.code,
        policyViolation.statusCode,
        policyViolation.message,
        policyViolation.details,
      );
    }
    await this.assertActorCapabilityForWrite(
      userId,
      "workspace-personal-sync.append",
      normalizedBlob.crypto_version,
    );

    if (EVENT_TYPES_REQUIRING_IDEMPOTENCY.has(input.eventType) && !input.idempotencyKey) {
      throw new WorkspacePersonalSyncServiceError(
        "SYNC_BAD_REQUEST",
        400,
        "idempotencyKey is required for this eventType",
      );
    }

    if (input.idempotencyKey !== undefined && input.idempotencyKey !== "") {
      if (!isEntityId(input.idempotencyKey)) {
        throw new WorkspacePersonalSyncServiceError(
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
        throw new WorkspacePersonalSyncServiceError(
          "SYNC_BAD_REQUEST",
          400,
          "clientCreatedAt must be a valid ISO-8601 date-time string",
        );
      }
      clientCreatedAt = new Date(parsed).toISOString();
    }

    try {
      const created = await this.events.append({
        workspaceId,
        userId,
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
      stopTimer();
      return mapEventToResponse(created);
    } catch (error) {
      stopTimer();
      if (error instanceof VersionConflictError) {
        throw new WorkspacePersonalSyncServiceError(
          "VERSION_MISMATCH",
          409,
          "baseVersion is stale",
          {
            expectedBaseVersion: error.expectedVersion,
            latestVersion: error.actualVersion,
          },
        );
      }
      throw error;
    }
  }

  private async ensureWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) {
      throw new WorkspacePersonalSyncServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    const hasAccess = await this.workspaces.hasAccess(workspaceId, userId);
    if (!hasAccess) {
      throw new WorkspacePersonalSyncServiceError("ACCESS_DENIED", 403, "access denied");
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
    throw new WorkspacePersonalSyncServiceError(
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
