import { VersionConflictError } from "../storage/errors.ts";
import type { EventRecord, EventsRepository, VaultsRepository } from "../storage/repositories.ts";

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
}

export interface SyncEventResponse {
  id: string;
  vaultId: string;
  actorId: string | null;
  eventType: string;
  encryptedPayload: string;
  payloadSchemaVersion: number;
  idempotencyKey: string | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}

export interface SyncAppendEventInput {
  eventType: string;
  encryptedPayload: string;
  baseVersion: number;
  payloadSchemaVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export class SyncService {
  private readonly vaults: SyncServiceDeps["vaults"];
  private readonly events: SyncServiceDeps["events"];

  constructor(deps: SyncServiceDeps) {
    this.vaults = deps.vaults;
    this.events = deps.events;
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

    const payloadSchemaVersion =
      input.payloadSchemaVersion === undefined ? 1 : input.payloadSchemaVersion;
    if (
      !Number.isInteger(payloadSchemaVersion) ||
      payloadSchemaVersion < 1 ||
      payloadSchemaVersion > 65535
    ) {
      throw new SyncServiceError(
        "SYNC_BAD_REQUEST",
        400,
        "payloadSchemaVersion must be an integer from 1 to 65535",
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

    let payloadBytes: Uint8Array;
    try {
      payloadBytes = Uint8Array.from(Buffer.from(input.encryptedPayload, "base64"));
    } catch {
      throw new SyncServiceError(
        "SYNC_INVALID_PAYLOAD",
        400,
        "encryptedPayload must be base64",
      );
    }
    if (payloadBytes.length === 0) {
      throw new SyncServiceError(
        "SYNC_INVALID_PAYLOAD",
        400,
        "encryptedPayload must not be empty",
      );
    }
    if (payloadBytes.length > SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES) {
      throw new SyncServiceError(
        "PAYLOAD_TOO_LARGE",
        413,
        `encryptedPayload exceeds ${SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES} bytes`,
      );
    }

    try {
      const created = await this.events.append({
        vaultId,
        actorId: userId,
        eventType: input.eventType,
        encryptedPayload: payloadBytes,
        baseVersion: input.baseVersion,
        payloadSchemaVersion,
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
  return {
    id: event.id,
    vaultId: event.vaultId,
    actorId: event.actorId,
    eventType: event.eventType,
    encryptedPayload: Buffer.from(event.encryptedPayload).toString("base64"),
    payloadSchemaVersion: event.payloadSchemaVersion,
    idempotencyKey: event.idempotencyKey,
    clientCreatedAt: event.clientCreatedAt,
    version: event.version,
    createdAt: event.createdAt,
  };
}
