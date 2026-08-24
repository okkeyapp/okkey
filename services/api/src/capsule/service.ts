import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  hasPlanFeature,
  type CapsuleApprovalRequestDto,
  type CapsuleApprovalStatusDto,
  type CapsuleListResponseDto,
  type CapsuleMetadataDto,
  type CapsuleOwnerDetailDto,
  type CapsuleOwnerListEntryDto,
  type CapsuleState,
  type CapsuleType,
  type CapsuleViewLimitAction,
} from "@okkey/types";
import { generateEntityId } from "../entity-id.ts";
import type { ApiConfig } from "../config.ts";
import {
  CRYPTO_CAPABILITY_REQUIRED,
  CRYPTO_CAPABILITY_REQUIRED_STATUS_CODE,
  buildCapabilityPolicyDetails,
  evaluateCapabilityDecision,
} from "../crypto/capability-policy.ts";
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
import {
  decodeEncryptedBlobFromStorage,
  mergeEncryptedBlobMeta,
  parseEncryptedBlobInput,
  serializeEncryptedBlobToStorage,
  type EncryptedBlob,
} from "../crypto/encrypted-blob.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { ObjectStorage } from "../storage/object-storage.ts";
import type { UsersRepository } from "../storage/repositories.ts";
import {
  CAPSULE_UNSAFE_KEY_TRANSPORT,
  CAPSULE_UNSAFE_KEY_TRANSPORT_STATUS_CODE,
  normalizeCapsuleKeyTransportMode,
  type CapsuleKeyTransportMode,
} from "./key-transport-policy.ts";
import {
  clientIpFromTrustedProxy,
  type GeoIpLookup,
  type GeoIpLocation,
} from "./geoip.ts";

const CAPSULE_TYPES = new Set(["text", "item", "file", "field"]);
const MAX_ENCRYPTED_PAYLOAD_BYTES = 1024 * 1024;

export class CapsuleServiceError extends Error {
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

export interface CapsuleServiceDeps {
  db: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
  redis: {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
  };
  config: Pick<
    ApiConfig,
    | "sessionSecret"
    | "capsuleOpenRateLimitPerIp"
    | "capsuleRateLimitWindowSeconds"
    | "allowedCryptoProfileVersions"
    | "deployEnv"
    | "cryptoRolloutMode"
    | "cryptoRolloutEnabled"
    | "cryptoRolloutState"
    | "cryptoRolloutStopWritePaths"
    | "trustedProxyHops"
  >;
  users?: Pick<UsersRepository, "findById">;
  objectStorage: Pick<ObjectStorage, "putObject" | "getObject" | "deleteObject">;
  geoIp?: GeoIpLookup;
  log?: Logger;
}

interface CapsuleRow {
  id: string;
  workspace_id: string;
  creator_id: string | null;
  type: string;
  encrypted_payload: Buffer;
  encrypted_metadata: Buffer | null;
  owner_key_wrap: Buffer | null;
  access_policy: unknown;
  expires_at: string | null;
  state: string;
  activate_at: string | null;
  deactivate_at: string | null;
  delete_at: string | null;
  view_limit: number | null;
  view_count: number;
  view_limit_action: string;
  password_attempt_limit: number | null;
  approval_required: boolean;
  created_at: string;
  updated_at: string;
}

interface PasswordPolicy {
  kdf: "scrypt-v1";
  salt: string;
  hash: string;
}

interface CapsuleAccessPolicy {
  password?: PasswordPolicy;
  allowedRecipientHashes?: string[];
  /** Owner-facing emails kept alongside hashes for edit UX. */
  allowedRecipientEmails?: string[];
  fileStorageKey?: string;
  fileSizeBytes?: number;
  keyTransportMode?: CapsuleKeyTransportMode;
  revoked?: boolean;
  revokedAt?: string;
}

export interface CreateCapsuleInput {
  type: string;
  encryptedPayload: unknown;
  encryptedMetadata?: unknown;
  ownerKeyWrap?: unknown;
  filePayload?: unknown;
  attachmentFilePayloads?: Record<string, unknown>;
  keyTransportMode?: string;
  expiresAt?: string;
  activateAt?: string;
  deactivateAt?: string;
  deleteAt?: string;
  maxViews?: number;
  viewLimitAction?: CapsuleViewLimitAction;
  password?: string;
  passwordAttemptLimit?: number;
  allowedRecipientEmails?: string[];
  approvalRequired?: boolean;
}

export interface UpdateCapsuleInput extends CreateCapsuleInput {
  keepExistingPassword?: boolean;
  keepExistingRecipients?: boolean;
  keepExistingFile?: boolean;
}

export type CapsuleMetadataResponse = CapsuleMetadataDto;

export interface OpenCapsuleResponse extends CapsuleMetadataResponse {
  encryptedPayload: EncryptedBlob;
  filePayload?: EncryptedBlob;
  attachmentPayloads?: Record<string, EncryptedBlob>;
}

export class CapsuleService {
  private readonly db: CapsuleServiceDeps["db"];
  private readonly redis: CapsuleServiceDeps["redis"];
  private readonly config: CapsuleServiceDeps["config"];
  private readonly users: CapsuleServiceDeps["users"];
  private readonly objectStorage: CapsuleServiceDeps["objectStorage"];
  private readonly geoIp?: GeoIpLookup;
  private readonly log: Logger | undefined;

  constructor(deps: CapsuleServiceDeps) {
    this.db = deps.db;
    this.redis = deps.redis;
    this.config = {
      ...deps.config,
      cryptoRolloutMode: deps.config.cryptoRolloutMode ?? "compat",
      cryptoRolloutEnabled: deps.config.cryptoRolloutEnabled ?? true,
      cryptoRolloutState: deps.config.cryptoRolloutState ?? "resume",
      cryptoRolloutStopWritePaths: deps.config.cryptoRolloutStopWritePaths ?? [],
    };
    this.users = deps.users;
    this.objectStorage = deps.objectStorage;
    this.geoIp = deps.geoIp;
    this.log = deps.log;
  }

  async resolveRequesterContext(input: {
    remoteAddress?: string;
    forwardedFor?: string;
    userAgent?: string;
  }): Promise<{
    ipAddress: string;
    deviceLabel: string;
    platform: string;
    location: GeoIpLocation;
  }> {
    const ipAddress = clientIpFromTrustedProxy(
      input.remoteAddress,
      input.forwardedFor,
      this.config.trustedProxyHops,
    );
    const { deviceLabel, platform } = parseUserAgent(input.userAgent);
    return {
      ipAddress,
      deviceLabel,
      platform,
      location: this.geoIp ? await this.geoIp.lookup(ipAddress) : { country: null, city: null },
    };
  }

  async createCapsule(
    workspaceId: string,
    creatorId: string,
    input: CreateCapsuleInput,
  ): Promise<CapsuleMetadataResponse> {
    const operation = "capsule.create";
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
      throw new CapsuleServiceError(
        rolloutGateViolation.code,
        rolloutGateViolation.statusCode,
        rolloutGateViolation.message,
        rolloutGateViolation.details,
      );
    }
    try {
    if (!CAPSULE_TYPES.has(input.type)) {
      throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "invalid capsule type");
    }
    const payloadBlob = parseBlobOrThrow(
      input.encryptedPayload,
      "encryptedPayload",
    );
    const normalizedPayloadBlob = mergeEncryptedBlobMeta(payloadBlob, {
      entity: "capsule_payload",
      capsule_type: input.type,
    });
    const payloadSchemaVersion = normalizedPayloadBlob.crypto_version;
    const policyViolation = getCryptoWritePolicyViolation(this.config, payloadSchemaVersion);
    if (policyViolation) {
      logCryptoPolicyViolation(this.log, {
        reason: "policy",
        deployEnv: this.config.deployEnv ?? "dev",
        actorId: creatorId,
        requestedVersion: payloadSchemaVersion,
      });
      throw new CapsuleServiceError(
        policyViolation.code,
        policyViolation.statusCode,
        policyViolation.message,
      );
    }
    await this.assertActorCapabilityForWrite(
      creatorId,
      "capsule.create",
      payloadSchemaVersion,
    );
    const payload = serializeEncryptedBlobToStorage(normalizedPayloadBlob);
    const encryptedMetadata = input.encryptedMetadata
      ? serializeEncryptedBlobToStorage(
          mergeEncryptedBlobMeta(parseBlobOrThrow(input.encryptedMetadata, "encryptedMetadata"), {
            entity: "capsule_owner_metadata",
          }),
        )
      : payload;
    const ownerKeyWrap = input.ownerKeyWrap
      ? serializeEncryptedBlobToStorage(
          mergeEncryptedBlobMeta(parseBlobOrThrow(input.ownerKeyWrap, "ownerKeyWrap"), {
            entity: "capsule_owner_key_wrap",
          }),
        )
      : payload;
    const keyTransportMode = assertSafeCapsuleKeyTransportMode(input.keyTransportMode);
    const workspace = await this.readWorkspaceAccess(workspaceId, creatorId);
    if (!workspace.exists) {
      throw new CapsuleServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    if (!workspace.canAccess) {
      throw new CapsuleServiceError("ACCESS_DENIED", 403, "access denied");
    }
    if (!hasPlanFeature(workspace.planTier, "capsules")) {
      throw new CapsuleServiceError("FEATURE_NOT_AVAILABLE", 403, "capsules are unavailable");
    }
    if (
      requestsCapsuleAccessSettings(input) &&
      !hasPlanFeature(workspace.planTier, "capsuleAccessSettings")
    ) {
      throw new CapsuleServiceError(
        "FEATURE_NOT_AVAILABLE",
        403,
        "capsule access settings are unavailable on this plan",
      );
    }

    const activateAt = normalizeOptionalIsoDate(input.activateAt);
    const deactivateAt = normalizeOptionalIsoDate(input.deactivateAt ?? input.expiresAt);
    const deleteAt = normalizeOptionalIsoDate(input.deleteAt);
    assertLifecycleOrder(activateAt, deactivateAt, deleteAt);
    const maxViews = normalizeMaxViews(input.maxViews);
    const viewLimitAction = normalizeViewLimitAction(input.viewLimitAction);
    const passwordAttemptLimit = normalizePasswordAttemptLimit(input.passwordAttemptLimit, input.password);
    const filePayload =
      input.type === "file"
        ? serializeEncryptedBlobToStorage(
            mergeEncryptedBlobMeta(parseBlobOrThrow(input.filePayload ?? null, "filePayload"), {
              entity: "capsule_file_payload",
              capsule_type: input.type,
            }),
          )
        : input.filePayload
          ? serializeEncryptedBlobToStorage(
              mergeEncryptedBlobMeta(parseBlobOrThrow(input.filePayload, "filePayload"), {
                entity: "capsule_file_payload",
                capsule_type: input.type,
              }),
            )
          : null;
    const attachmentFilePayloads = parseAttachmentFilePayloads(
      input.attachmentFilePayloads,
      input.type,
    );
    const accessPolicy = buildAccessPolicy(
      input.password,
      input.allowedRecipientEmails,
      this.config.sessionSecret,
      keyTransportMode,
    );

    const rows = await this.db.transaction(async (tx) => {
      const capsuleId = generateEntityId();
      const inserted = await tx.query<CapsuleRow>(
        `
          INSERT INTO capsules (
            id,
            workspace_id,
            creator_id,
            type,
            encrypted_payload,
            encrypted_metadata,
            owner_key_wrap,
            access_policy,
            expires_at,
            state,
            activate_at,
            deactivate_at,
            delete_at,
            view_limit,
            view_count,
            view_limit_action,
            password_attempt_limit,
            approval_required
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz,
            'active', $10::timestamptz, $11::timestamptz, $12::timestamptz,
            $13, 0, $14, $15, $16
          )
          RETURNING
            id, workspace_id, creator_id, type, encrypted_payload, encrypted_metadata,
            owner_key_wrap, access_policy, expires_at, state, activate_at, deactivate_at,
            delete_at, view_limit, view_count, view_limit_action, password_attempt_limit,
            approval_required, created_at, updated_at
        `,
        [
          capsuleId,
          workspaceId,
          creatorId,
          input.type,
          Buffer.from(payload),
          Buffer.from(encryptedMetadata),
          Buffer.from(ownerKeyWrap),
          JSON.stringify(accessPolicy),
          deactivateAt,
          activateAt,
          deactivateAt,
          deleteAt,
          maxViews,
          viewLimitAction,
          passwordAttemptLimit,
          Boolean(input.approvalRequired),
        ],
      );
      const created = inserted[0];

      if (attachmentFilePayloads) {
        await this.storeAttachmentFilePayloads(tx, created.id, attachmentFilePayloads);
      }

      if (filePayload) {
        const storageKey = `capsules/${created.id}/file.bin`;
        await this.objectStorage.putObject(storageKey, filePayload);
        await tx.query(
          `
            INSERT INTO capsule_files (id, capsule_id, asset_id, storage_key, size_bytes)
            VALUES ($1::bigint, $2, ($1::bigint)::text, $3, $4)
          `,
          [generateEntityId(), created.id, storageKey, filePayload.length],
        );
        await tx.query(
          `
            UPDATE capsules
            SET access_policy = jsonb_set(
              jsonb_set(COALESCE(access_policy, '{}'::jsonb), '{fileStorageKey}', to_jsonb($2::text), true),
              '{fileSizeBytes}',
              to_jsonb($3::int),
              true
            )
            WHERE id = $1
          `,
          [created.id, storageKey, filePayload.length],
        );
      }

      if (filePayload || attachmentFilePayloads) {
        const withFiles = await tx.query<CapsuleRow>(
          `
            SELECT
              id, workspace_id, creator_id, type, encrypted_payload, encrypted_metadata,
              owner_key_wrap, access_policy, expires_at, state, activate_at, deactivate_at,
              delete_at, view_limit, view_count, view_limit_action, password_attempt_limit,
              approval_required, created_at, updated_at
            FROM capsules
            WHERE id = $1
          `,
          [created.id],
        );
        return withFiles;
      }
      return inserted;
    });

      recordCryptoOperationOutcome(this.log, {
        operation,
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "success",
      });
      return mapMetadata(rows[0]);
    } catch (error) {
      recordCryptoOperationOutcome(this.log, {
        operation,
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "error",
        code: error instanceof CapsuleServiceError ? error.code : "UNEXPECTED",
      });
      throw error;
    } finally {
      stopTimer();
    }
  }

  async listOwnerCapsules(
    workspaceId: string,
    creatorId: string,
    page = 1,
    pageSize = 30,
  ): Promise<CapsuleListResponseDto> {
    const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const normalizedPageSize = Math.min(100, Math.max(1, Number.isInteger(pageSize) ? pageSize : 30));
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const countRows = await this.db.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM capsules WHERE workspace_id = $1 AND creator_id = $2",
      [workspaceId, creatorId],
    );
    const rows = await this.db.query<CapsuleRow>(
      `
        SELECT
          id, workspace_id, creator_id, type, encrypted_payload, encrypted_metadata,
          owner_key_wrap, access_policy, expires_at, state, activate_at, deactivate_at,
          delete_at, view_limit, view_count, view_limit_action, password_attempt_limit,
          approval_required, created_at, updated_at
        FROM capsules
        WHERE workspace_id = $1 AND creator_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $3 OFFSET $4
      `,
      [workspaceId, creatorId, normalizedPageSize, offset],
    );
    const total = Number(countRows[0]?.total ?? 0);
    return {
      capsules: rows.map(mapOwnerMetadata),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  async getOwnerCapsule(capsuleId: string, creatorId: string): Promise<CapsuleOwnerDetailDto> {
    const capsule = await this.loadCapsule(capsuleId);
    if (capsule.creator_id !== creatorId) {
      throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
    }
    const policy = parsePolicy(capsule.access_policy);
    const detail: CapsuleOwnerDetailDto = {
      ...mapOwnerMetadata(capsule),
      encryptedPayload: decodeEncryptedBlobFromStorage(Uint8Array.from(capsule.encrypted_payload)),
    };
    if (policy.fileStorageKey) {
      const filePayload = await this.objectStorage.getObject(policy.fileStorageKey);
      if (filePayload) {
        detail.filePayload = decodeEncryptedBlobFromStorage(Uint8Array.from(filePayload));
      }
    }
    const recipientEmails = await this.resolveOwnerRecipientEmails(capsule.workspace_id, policy);
    if (recipientEmails.length > 0) {
      detail.allowedRecipientEmails = recipientEmails;
    }
    return detail;
  }

  async updateCapsule(
    capsuleId: string,
    creatorId: string,
    input: UpdateCapsuleInput,
  ): Promise<CapsuleMetadataResponse> {
    const operation = "capsule.create";
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
      throw new CapsuleServiceError(
        rolloutGateViolation.code,
        rolloutGateViolation.statusCode,
        rolloutGateViolation.message,
        rolloutGateViolation.details,
      );
    }
    try {
      if (!CAPSULE_TYPES.has(input.type)) {
        throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "invalid capsule type");
      }
      const existing = await this.loadCapsule(capsuleId);
      if (existing.creator_id !== creatorId) {
        throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
      }
      const payloadBlob = parseBlobOrThrow(input.encryptedPayload, "encryptedPayload");
      const normalizedPayloadBlob = mergeEncryptedBlobMeta(payloadBlob, {
        entity: "capsule_payload",
        capsule_type: input.type,
      });
      const payloadSchemaVersion = normalizedPayloadBlob.crypto_version;
      const policyViolation = getCryptoWritePolicyViolation(this.config, payloadSchemaVersion);
      if (policyViolation) {
        throw new CapsuleServiceError(
          policyViolation.code,
          policyViolation.statusCode,
          policyViolation.message,
        );
      }
      await this.assertActorCapabilityForWrite(creatorId, "capsule.create", payloadSchemaVersion);
      const payload = serializeEncryptedBlobToStorage(normalizedPayloadBlob);
      const encryptedMetadata = input.encryptedMetadata
        ? serializeEncryptedBlobToStorage(
            mergeEncryptedBlobMeta(parseBlobOrThrow(input.encryptedMetadata, "encryptedMetadata"), {
              entity: "capsule_owner_metadata",
            }),
          )
        : payload;
      const ownerKeyWrap = input.ownerKeyWrap
        ? serializeEncryptedBlobToStorage(
            mergeEncryptedBlobMeta(parseBlobOrThrow(input.ownerKeyWrap, "ownerKeyWrap"), {
              entity: "capsule_owner_key_wrap",
            }),
          )
        : payload;
      const keyTransportMode = assertSafeCapsuleKeyTransportMode(input.keyTransportMode);
      const workspace = await this.readWorkspaceAccess(existing.workspace_id, creatorId);
      if (!workspace.exists) {
        throw new CapsuleServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
      }
      if (!workspace.canAccess) {
        throw new CapsuleServiceError("ACCESS_DENIED", 403, "access denied");
      }
      if (
        requestsCapsuleAccessSettings(input) &&
        !hasPlanFeature(workspace.planTier, "capsuleAccessSettings")
      ) {
        throw new CapsuleServiceError(
          "FEATURE_NOT_AVAILABLE",
          403,
          "capsule access settings are unavailable on this plan",
        );
      }

      const activateAt = normalizeOptionalIsoDate(input.activateAt);
      const deactivateAt = normalizeOptionalIsoDate(input.deactivateAt ?? input.expiresAt);
      const deleteAt = normalizeOptionalIsoDate(input.deleteAt);
      assertLifecycleOrder(activateAt, deactivateAt, deleteAt);
      const maxViews = normalizeMaxViews(input.maxViews);
      const viewLimitAction = normalizeViewLimitAction(input.viewLimitAction);
      const existingPolicy = parsePolicy(existing.access_policy);
      const nextPolicy = buildAccessPolicy(
        input.keepExistingPassword ? undefined : input.password,
        input.keepExistingRecipients ? undefined : input.allowedRecipientEmails,
        this.config.sessionSecret,
        keyTransportMode,
      );
      if (input.keepExistingPassword && existingPolicy.password) {
        nextPolicy.password = existingPolicy.password;
      }
      if (input.keepExistingRecipients && existingPolicy.allowedRecipientHashes?.length) {
        nextPolicy.allowedRecipientHashes = existingPolicy.allowedRecipientHashes;
        if (existingPolicy.allowedRecipientEmails?.length) {
          nextPolicy.allowedRecipientEmails = existingPolicy.allowedRecipientEmails;
        }
      }
      const passwordAttemptLimit = input.keepExistingPassword
        ? normalizePasswordAttemptLimit(
            input.passwordAttemptLimit ?? existing.password_attempt_limit ?? undefined,
            nextPolicy.password ? "kept" : undefined,
          )
        : normalizePasswordAttemptLimit(input.passwordAttemptLimit, input.password);
      const replacingFile = Boolean(input.filePayload) && !input.keepExistingFile;
      const filePayload = replacingFile
        ? serializeEncryptedBlobToStorage(
            mergeEncryptedBlobMeta(parseBlobOrThrow(input.filePayload ?? null, "filePayload"), {
              entity: "capsule_file_payload",
              capsule_type: input.type,
            }),
          )
        : null;
      const keepFile = Boolean(input.keepExistingFile && existingPolicy.fileStorageKey);
      if (input.type === "file" && !replacingFile && !keepFile) {
        throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "filePayload is required");
      }
      const attachmentFilePayloads = parseAttachmentFilePayloads(
        input.attachmentFilePayloads,
        input.type,
      );

      const rows = await this.db.transaction(async (tx) => {
        if (existingPolicy.fileStorageKey && (!keepFile || replacingFile)) {
          await this.objectStorage.deleteObject(existingPolicy.fileStorageKey);
          await tx.query("DELETE FROM capsule_files WHERE capsule_id = $1", [capsuleId]);
          delete nextPolicy.fileStorageKey;
          delete nextPolicy.fileSizeBytes;
        }
        if (filePayload) {
          const storageKey = `capsules/${capsuleId}/file.bin`;
          await this.objectStorage.putObject(storageKey, filePayload);
          await tx.query(
            `
              INSERT INTO capsule_files (id, capsule_id, asset_id, storage_key, size_bytes)
              VALUES ($1::bigint, $2, ($1::bigint)::text, $3, $4)
            `,
            [generateEntityId(), capsuleId, storageKey, filePayload.length],
          );
          nextPolicy.fileStorageKey = storageKey;
          nextPolicy.fileSizeBytes = filePayload.length;
        } else if (keepFile) {
          nextPolicy.fileStorageKey = existingPolicy.fileStorageKey;
          nextPolicy.fileSizeBytes = existingPolicy.fileSizeBytes;
        }

        if (attachmentFilePayloads) {
          await this.storeAttachmentFilePayloads(tx, capsuleId, attachmentFilePayloads);
        }

        const updated = await tx.query<CapsuleRow>(
          `
            UPDATE capsules
            SET
              type = $3,
              encrypted_payload = $4,
              encrypted_metadata = $5,
              owner_key_wrap = $6,
              access_policy = $7::jsonb,
              expires_at = $8::timestamptz,
              activate_at = $9::timestamptz,
              deactivate_at = $10::timestamptz,
              delete_at = $11::timestamptz,
              view_limit = $12,
              view_count = CASE WHEN $12::int IS NULL THEN view_count ELSE 0 END,
              view_limit_action = $13,
              password_attempt_limit = $14,
              approval_required = $15,
              updated_at = now(),
              version = version + 1
            WHERE id = $1 AND creator_id = $2
            RETURNING
              id, workspace_id, creator_id, type, encrypted_payload, encrypted_metadata,
              owner_key_wrap, access_policy, expires_at, state, activate_at, deactivate_at,
              delete_at, view_limit, view_count, view_limit_action, password_attempt_limit,
              approval_required, created_at, updated_at
          `,
          [
            capsuleId,
            creatorId,
            input.type,
            Buffer.from(payload),
            Buffer.from(encryptedMetadata),
            Buffer.from(ownerKeyWrap),
            JSON.stringify(nextPolicy),
            deactivateAt,
            activateAt,
            deactivateAt,
            deleteAt,
            maxViews,
            viewLimitAction,
            passwordAttemptLimit,
            Boolean(input.approvalRequired),
          ],
        );
        if (!updated[0]) {
          throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
        }
        return updated;
      });
      recordCryptoOperationOutcome(this.log, {
        operation,
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "success",
      });
      return mapMetadata(rows[0]);
    } catch (error) {
      recordCryptoOperationOutcome(this.log, {
        operation,
        deployEnv: this.config.deployEnv,
        rolloutMode: this.config.cryptoRolloutMode,
        outcome: "error",
        code: error instanceof CapsuleServiceError ? error.code : "UNEXPECTED",
      });
      throw error;
    } finally {
      stopTimer();
    }
  }

  async setCapsuleState(capsuleId: string, creatorId: string, state: CapsuleState): Promise<CapsuleMetadataResponse> {
    if (state !== "active" && state !== "inactive") {
      throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "invalid capsule state");
    }
    const rows = await this.db.transaction(async (tx) => {
      const updated = await tx.query<CapsuleRow>(
        `
          UPDATE capsules
          SET
            state = $3,
            view_count = CASE
              WHEN $3 = 'active' THEN 0
              ELSE view_count
            END,
            activate_at = CASE
              WHEN $3 = 'active' THEN NULL
              ELSE activate_at
            END,
            deactivate_at = CASE
              WHEN $3 = 'active' AND deactivate_at IS NOT NULL AND deactivate_at <= now() THEN NULL
              ELSE deactivate_at
            END,
            expires_at = CASE
              WHEN $3 = 'active' AND (
                (expires_at IS NOT NULL AND expires_at <= now())
                OR (deactivate_at IS NOT NULL AND deactivate_at <= now())
              ) THEN NULL
              ELSE expires_at
            END,
            delete_at = CASE
              WHEN $3 = 'active' AND delete_at IS NOT NULL AND delete_at <= now() THEN NULL
              ELSE delete_at
            END,
            updated_at = now(),
            version = version + 1
          WHERE id = $1 AND creator_id = $2
          RETURNING
            id, workspace_id, creator_id, type, encrypted_payload, encrypted_metadata,
            owner_key_wrap, access_policy, expires_at, state, activate_at, deactivate_at,
            delete_at, view_limit, view_count, view_limit_action, password_attempt_limit,
            approval_required, created_at, updated_at
        `,
        [capsuleId, creatorId, state],
      );
      if (!updated[0]) {
        throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
      }
      if (state === "active") {
        await tx.query("DELETE FROM capsule_view_requests WHERE capsule_id = $1", [capsuleId]);
      }
      return updated;
    });
    return mapMetadata(rows[0]);
  }

  async deleteCapsule(capsuleId: string, creatorId: string): Promise<void> {
    const fileRows = await this.db.query<{ storage_key: string }>(
      `SELECT cf.storage_key
       FROM capsule_files cf
       JOIN capsules c ON c.id = cf.capsule_id
       WHERE c.id = $1 AND c.creator_id = $2`,
      [capsuleId, creatorId],
    );
    const deleted = await this.db.query<{ id: string }>(
      "DELETE FROM capsules WHERE id = $1 AND creator_id = $2 RETURNING id",
      [capsuleId, creatorId],
    );
    if (!deleted[0]) {
      throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
    }
    await Promise.all(fileRows.map((file) => this.objectStorage.deleteObject(file.storage_key)));
  }

  async purgeDueCapsules(now = new Date()): Promise<number> {
    const { ids, storageKeys } = await this.db.transaction(async (tx) => {
      const due = await tx.query<{ id: string }>(
        `
          SELECT id
          FROM capsules
          WHERE delete_at IS NOT NULL AND delete_at <= $1::timestamptz
          ORDER BY delete_at
          LIMIT 500
          FOR UPDATE SKIP LOCKED
        `,
        [now.toISOString()],
      );
      const ids = due.map((row) => row.id);
      if (ids.length === 0) {
        return { ids, storageKeys: [] as string[] };
      }
      const files = await tx.query<{ storage_key: string }>(
        "SELECT storage_key FROM capsule_files WHERE capsule_id = ANY($1::bigint[])",
        [ids],
      );
      await tx.query("DELETE FROM capsules WHERE id = ANY($1::bigint[])", [ids]);
      return { ids, storageKeys: files.map((row) => row.storage_key) };
    });
    await Promise.all(storageKeys.map((storageKey) => this.objectStorage.deleteObject(storageKey)));
    return ids.length;
  }

  async requestCapsuleApproval(input: {
    capsuleId: string;
    requesterUserId?: string;
    guestSessionId?: string;
    requesterEmail?: string;
    requestIp: string;
    deviceLabel?: string;
    platform?: string;
    country?: string | null;
    city?: string | null;
  }): Promise<CapsuleApprovalStatusDto> {
    const capsule = await this.loadCapsule(input.capsuleId);
    ensureCapsuleAccessible(capsule);
    if (!capsule.approval_required) {
      throw new CapsuleServiceError("CAPSULE_APPROVAL_NOT_REQUIRED", 400, "approval is not required");
    }

    const policy = parsePolicy(capsule.access_policy);
    const recipientRestricted = Boolean(policy.allowedRecipientHashes?.length);
    const guestSessionId = input.guestSessionId?.trim() || undefined;
    let requesterUserId = input.requesterUserId;
    let requesterEmail = input.requesterEmail;
    let requesterName: string | null = null;

    if (recipientRestricted) {
      if (!requesterUserId) {
        throw new CapsuleServiceError("AUTH_REQUIRED", 401, "authenticated email required");
      }
      if (this.users) {
        requesterEmail = (await this.users.findById(requesterUserId))?.email;
      }
      if (!requesterEmail) {
        throw new CapsuleServiceError("AUTH_REQUIRED", 401, "authenticated email required");
      }
      validateRecipient(capsule, requesterEmail, this.config.sessionSecret);
      requesterEmail = normalizeEmail(requesterEmail);
    } else if (requesterUserId) {
      if (this.users) {
        requesterEmail = (await this.users.findById(requesterUserId))?.email;
      }
      if (!requesterEmail) {
        throw new CapsuleServiceError("AUTH_REQUIRED", 401, "authenticated email required");
      }
      requesterEmail = normalizeEmail(requesterEmail);
    } else if (guestSessionId) {
      requesterUserId = undefined;
      requesterEmail = "guest";
      requesterName = "Гость";
    } else {
      throw new CapsuleServiceError("AUTH_REQUIRED", 401, "authenticated email required");
    }

    const identityClause = requesterUserId
      ? "requester_user_id = $2"
      : "guest_session_id = $2";
    const identityValue = requesterUserId ?? guestSessionId!;

    const denied = await this.db.query<{ id: string }>(
      `SELECT id FROM capsule_view_requests
       WHERE capsule_id = $1 AND ${identityClause} AND status = 'denied'
       LIMIT 1`,
      [input.capsuleId, identityValue],
    );
    if (denied[0]) {
      throw new CapsuleServiceError("CAPSULE_APPROVAL_DENIED", 403, "capsule approval denied");
    }
    const existing = await this.db.query<{ id: string; status: string }>(
      `SELECT id, status FROM capsule_view_requests
       WHERE capsule_id = $1 AND ${identityClause} AND status IN ('pending', 'approved')
       ORDER BY requested_at DESC LIMIT 1`,
      [input.capsuleId, identityValue],
    );
    if (existing[0]) {
      return {
        requestId: existing[0].id,
        status: existing[0].status === "approved" ? "approved" : "pending",
      };
    }
    const requestId = generateEntityId();
    const emailForHash = requesterUserId
      ? requesterEmail!
      : `guest:${guestSessionId}`;
    await this.db.query(
      `
        INSERT INTO capsule_view_requests (
          id, capsule_id, requester_user_id, guest_session_id, requester_email_hash, requester_email,
          requester_name, device_label, platform, ip_address, country, city, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, 'unknown')::inet, $11, $12, 'pending')
      `,
      [
        requestId,
        input.capsuleId,
        requesterUserId ?? null,
        guestSessionId ?? null,
        hashRecipient(emailForHash, this.config.sessionSecret),
        requesterEmail!,
        requesterName,
        input.deviceLabel?.trim() || "Unknown device",
        input.platform?.trim() || "Unknown",
        input.requestIp,
        input.country ?? null,
        input.city ?? null,
      ],
    );
    return { requestId, status: "pending" };
  }

  async getApprovalStatus(
    requestId: string,
    requesterUserId?: string,
    guestSessionId?: string,
  ): Promise<CapsuleApprovalStatusDto> {
    const identityClause = requesterUserId
      ? "requester_user_id = $2"
      : "guest_session_id = $2";
    const identityValue = requesterUserId ?? guestSessionId?.trim();
    if (!identityValue) {
      throw new CapsuleServiceError("AUTH_REQUIRED", 401, "authenticated email required");
    }
    const rows = await this.db.query<{ id: string; status: string; approval_token_hash: string | null }>(
      `SELECT id, status, approval_token_hash
       FROM capsule_view_requests
       WHERE id = $1 AND ${identityClause}`,
      [requestId, identityValue],
    );
    const row = rows[0];
    if (!row) {
      throw new CapsuleServiceError("CAPSULE_APPROVAL_NOT_FOUND", 404, "approval request not found");
    }
    return {
      requestId: row.id,
      status: normalizeApprovalStatus(row.status),
      ...(row.status === "approved"
        ? { approvalToken: approvalTokenForRequest(row.id, this.config.sessionSecret) }
        : {}),
    };
  }

  async listPendingApprovals(ownerId: string): Promise<CapsuleApprovalRequestDto[]> {
    const rows = await this.db.query<{
      id: string;
      capsule_id: string;
      type: string;
      encrypted_metadata: Buffer | null;
      owner_key_wrap: Buffer | null;
      requester_user_id: string | null;
      requester_email: string;
      requester_name: string | null;
      device_label: string;
      platform: string;
      ip_address: string | null;
      country: string | null;
      city: string | null;
      requested_at: string;
      status: string;
    }>(
      `
        SELECT
          r.id, r.capsule_id, c.type, c.encrypted_metadata, c.owner_key_wrap, r.requester_user_id,
          r.requester_email, r.requester_name, r.device_label, r.platform,
          host(r.ip_address) AS ip_address, r.country, r.city, r.requested_at, r.status
        FROM capsule_view_requests r
        JOIN capsules c ON c.id = r.capsule_id
        WHERE c.creator_id = $1 AND r.status = 'pending'
        ORDER BY r.requested_at ASC
      `,
      [ownerId],
    );
    return rows.map((row) => ({
      requestId: row.id,
      capsuleId: row.capsule_id,
      capsuleType: normalizeCapsuleType(row.type),
      ...(row.encrypted_metadata
        ? { encryptedCapsuleMetadata: decodeEncryptedBlobFromStorage(Uint8Array.from(row.encrypted_metadata)) }
        : {}),
      ...(row.owner_key_wrap
        ? { ownerKeyWrap: decodeEncryptedBlobFromStorage(Uint8Array.from(row.owner_key_wrap)) }
        : {}),
      requesterUserId: row.requester_user_id,
      requesterEmail: row.requester_email,
      requesterName: row.requester_name,
      deviceLabel: row.device_label,
      platform: row.platform,
      ipAddress: row.ip_address ?? "unknown",
      country: row.country,
      city: row.city,
      requestedAt: row.requested_at,
      status: "pending",
    }));
  }

  async resolveApproval(
    requestId: string,
    ownerId: string,
    decision: "approve" | "deny",
  ): Promise<"approved" | "denied"> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<{ capsule_id: string }>(
        `SELECT r.capsule_id
         FROM capsule_view_requests r
         JOIN capsules c ON c.id = r.capsule_id
         WHERE r.id = $1 AND c.creator_id = $2 AND r.status = 'pending'
         FOR UPDATE`,
        [requestId, ownerId],
      );
      const row = rows[0];
      if (!row) {
        throw new CapsuleServiceError("CAPSULE_APPROVAL_NOT_FOUND", 404, "approval request not found");
      }
      if (decision === "approve") {
        const token = approvalTokenForRequest(requestId, this.config.sessionSecret);
        await tx.query(
          `UPDATE capsule_view_requests
           SET status = 'approved', approval_token_hash = $2, resolved_at = now()
           WHERE id = $1`,
          [requestId, hashApprovalToken(token, this.config.sessionSecret)],
        );
        return "approved";
      }
      await tx.query(
        `UPDATE capsule_view_requests
         SET status = 'denied', resolved_at = now(), approval_token_hash = NULL
         WHERE id = $1`,
        [requestId],
      );
      await this.deactivateIfAllRecipientsDenied(tx, row.capsule_id);
      return "denied";
    });
  }

  async getCapsuleMetadata(capsuleId: string): Promise<CapsuleMetadataResponse> {
    const capsule = await this.loadCapsule(capsuleId);
    const policy = parsePolicy(capsule.access_policy);
    if (policy.revoked) {
      throw new CapsuleServiceError("CAPSULE_REVOKED", 410, "capsule revoked");
    }
    if (capsule.delete_at && Date.now() >= Date.parse(String(capsule.delete_at))) {
      throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
    }
    // Return effective state instead of throwing for inactive / view-limit capsules so
    // viewers can distinguish "not active yet" from hard failures after reactivation.
    return mapMetadata(capsule);
  }

  async openCapsule(
    capsuleId: string,
    requestIp: string,
    password?: string,
    recipientEmail?: string,
    keyTransportMode?: string,
    approvalToken?: string,
    requesterUserId?: string,
    guestSessionId?: string,
  ): Promise<OpenCapsuleResponse> {
    await this.consumeOpenRateLimit(requestIp);
    assertSafeCapsuleKeyTransportMode(keyTransportMode);
    let sessionRecipientEmail = recipientEmail;
    if (requesterUserId && this.users) {
      const requester = await this.users.findById(requesterUserId);
      sessionRecipientEmail = requester?.email;
    }
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<CapsuleRow>(
        `
          SELECT
            id, workspace_id, creator_id, type, encrypted_payload, encrypted_metadata,
            owner_key_wrap, access_policy, expires_at, state, activate_at, deactivate_at,
            delete_at, view_limit, view_count, view_limit_action, password_attempt_limit,
            approval_required, created_at, updated_at
          FROM capsules
          WHERE id = $1
          FOR UPDATE
        `,
        [capsuleId],
      );
      const capsule = rows[0];
      if (!capsule) {
        throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
      }
      ensureCapsuleAccessible(capsule);
      try {
        validatePassword(capsule, password, this.config.sessionSecret);
      } catch (error) {
        if (
          error instanceof CapsuleServiceError &&
          error.code === "CAPSULE_PASSWORD_INVALID" &&
          capsule.password_attempt_limit
        ) {
          const attempts = await this.redis.incr(`capsule:password:${capsule.id}:${requestIp}`);
          if (attempts === 1) {
            await this.redis.expire(
              `capsule:password:${capsule.id}:${requestIp}`,
              this.config.capsuleRateLimitWindowSeconds,
            );
          }
          if (attempts >= capsule.password_attempt_limit) {
            throw new CapsuleServiceError(
              "CAPSULE_PASSWORD_ATTEMPTS_EXCEEDED",
              429,
              "password attempts exceeded",
            );
          }
        }
        throw error;
      }
      validateRecipient(capsule, sessionRecipientEmail, this.config.sessionSecret);
      let approvalRequestId: string | null = null;
      if (capsule.approval_required) {
        if (!approvalToken) {
          throw new CapsuleServiceError("CAPSULE_APPROVAL_REQUIRED", 403, "owner approval required");
        }
        const tokenHash = hashApprovalToken(approvalToken, this.config.sessionSecret);
        const approvalRows = await tx.query<{
          id: string;
          requester_user_id: string | null;
          guest_session_id: string | null;
          approval_token_hash: string | null;
        }>(
          `SELECT id, requester_user_id, guest_session_id, approval_token_hash
           FROM capsule_view_requests
           WHERE capsule_id = $1 AND status = 'approved' AND approval_token_hash = $2
           FOR UPDATE`,
          [capsule.id, tokenHash],
        );
        const approval = approvalRows[0];
        if (!approval) {
          throw new CapsuleServiceError("CAPSULE_APPROVAL_INVALID", 403, "invalid approval token");
        }
        if (approval.requester_user_id) {
          if (!requesterUserId || approval.requester_user_id !== requesterUserId) {
            throw new CapsuleServiceError("CAPSULE_APPROVAL_INVALID", 403, "invalid approval token");
          }
        } else if (approval.guest_session_id) {
          if (!guestSessionId || approval.guest_session_id !== guestSessionId) {
            throw new CapsuleServiceError("CAPSULE_APPROVAL_INVALID", 403, "invalid approval token");
          }
        } else {
          throw new CapsuleServiceError("CAPSULE_APPROVAL_INVALID", 403, "invalid approval token");
        }
        approvalRequestId = approval.id;
      }

      const nextViewCount = capsule.view_count + 1;
      const reachesLimit = capsule.view_limit !== null && nextViewCount >= capsule.view_limit;
      const response: OpenCapsuleResponse = {
        ...mapMetadata({ ...capsule, view_count: nextViewCount }),
        encryptedPayload: decodeEncryptedBlobFromStorage(Uint8Array.from(capsule.encrypted_payload)),
      };
      const policy = parsePolicy(capsule.access_policy);
      if (policy.fileStorageKey) {
        const filePayload = await this.objectStorage.getObject(policy.fileStorageKey);
        if (filePayload) {
          response.filePayload = decodeEncryptedBlobFromStorage(Uint8Array.from(filePayload));
        }
      }
      const attachmentRows = await tx.query<{ asset_id: string; storage_key: string }>(
        `SELECT asset_id, storage_key FROM capsule_files WHERE capsule_id = $1`,
        [capsule.id],
      );
      if (attachmentRows.length > 0) {
        const attachmentPayloads: Record<string, EncryptedBlob> = {};
        for (const row of attachmentRows) {
          if (policy.fileStorageKey && row.storage_key === policy.fileStorageKey) {
            continue;
          }
          const stored = await this.objectStorage.getObject(row.storage_key);
          if (stored) {
            attachmentPayloads[row.asset_id] = decodeEncryptedBlobFromStorage(
              Uint8Array.from(stored),
            );
          }
        }
        if (Object.keys(attachmentPayloads).length > 0) {
          response.attachmentPayloads = attachmentPayloads;
        }
      }
      if (reachesLimit && capsule.view_limit_action === "delete") {
        if (policy.fileStorageKey) {
          await this.objectStorage.deleteObject(policy.fileStorageKey);
        }
        for (const row of attachmentRows) {
          if (row.storage_key !== policy.fileStorageKey) {
            await this.objectStorage.deleteObject(row.storage_key);
          }
        }
        await tx.query("DELETE FROM capsules WHERE id = $1", [capsule.id]);
      } else {
        await tx.query(
          `
            UPDATE capsules
            SET
              view_count = view_count + 1,
              state = CASE WHEN $2::boolean THEN 'inactive' ELSE state END,
              updated_at = now()
            WHERE id = $1
          `,
          [capsule.id, reachesLimit],
        );
      }
      if (approvalRequestId) {
        await tx.query(
          `UPDATE capsule_view_requests
           SET status = 'consumed', consumed_at = now(), approval_token_hash = NULL
           WHERE id = $1`,
          [approvalRequestId],
        );
      }
      return response;
    });
  }

  async revokeCapsule(capsuleId: string, creatorId: string): Promise<void> {
    const rows = await this.db.query<{ id: string }>(
      `
        UPDATE capsules
        SET
          access_policy = jsonb_set(
            jsonb_set(COALESCE(access_policy, '{}'::jsonb), '{revoked}', 'true'::jsonb, true),
            '{revokedAt}',
            to_jsonb(now()::text),
            true
          ),
          updated_at = now()
        WHERE id = $1
          AND creator_id = $2
        RETURNING id
      `,
      [capsuleId, creatorId],
    );
    if (!rows[0]) {
      throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
    }
  }

  private async storeAttachmentFilePayloads(
    tx: QueryExecutor,
    capsuleId: string,
    payloads: Record<string, Buffer>,
  ): Promise<void> {
    for (const [assetId, serialized] of Object.entries(payloads)) {
      const storageKey = `capsules/${capsuleId}/attachments/${encodeURIComponent(assetId)}.bin`;
      await this.objectStorage.putObject(storageKey, serialized);
      await tx.query(
        `
          INSERT INTO capsule_files (id, capsule_id, asset_id, storage_key, size_bytes)
          VALUES ($1::bigint, $2, $3, $4, $5)
          ON CONFLICT (capsule_id, asset_id) DO UPDATE
            SET storage_key = EXCLUDED.storage_key,
                size_bytes = EXCLUDED.size_bytes
        `,
        [generateEntityId(), capsuleId, assetId, storageKey, serialized.length],
      );
    }
  }

  private async loadCapsule(capsuleId: string): Promise<CapsuleRow> {
    const rows = await this.db.query<CapsuleRow>(
      `
        SELECT
          id, workspace_id, creator_id, type, encrypted_payload, encrypted_metadata,
          owner_key_wrap, access_policy, expires_at, state, activate_at, deactivate_at,
          delete_at, view_limit, view_count, view_limit_action, password_attempt_limit,
          approval_required, created_at, updated_at
        FROM capsules
        WHERE id = $1
      `,
      [capsuleId],
    );
    const capsule = rows[0];
    if (!capsule) {
      throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
    }
    return capsule;
  }

  private async deactivateIfAllRecipientsDenied(tx: QueryExecutor, capsuleId: string): Promise<void> {
    const capsules = await tx.query<{ access_policy: unknown }>(
      "SELECT access_policy FROM capsules WHERE id = $1 FOR UPDATE",
      [capsuleId],
    );
    const allowed = parsePolicy(capsules[0]?.access_policy).allowedRecipientHashes ?? [];
    if (allowed.length === 0) {
      return;
    }
    const denied = await tx.query<{ requester_email_hash: string }>(
      `SELECT DISTINCT requester_email_hash
       FROM capsule_view_requests
       WHERE capsule_id = $1 AND status = 'denied'`,
      [capsuleId],
    );
    const deniedHashes = new Set(denied.map((row) => row.requester_email_hash));
    if (allowed.every((hash) => deniedHashes.has(hash))) {
      await tx.query(
        "UPDATE capsules SET state = 'inactive', updated_at = now(), version = version + 1 WHERE id = $1",
        [capsuleId],
      );
    }
  }

  private async resolveOwnerRecipientEmails(
    workspaceId: string,
    policy: CapsuleAccessPolicy,
  ): Promise<string[]> {
    const stored = (policy.allowedRecipientEmails ?? [])
      .map(normalizeEmail)
      .filter(Boolean);
    if (stored.length > 0) {
      return Array.from(new Set(stored));
    }
    const hashes = policy.allowedRecipientHashes ?? [];
    if (hashes.length === 0) {
      return [];
    }
    const hashSet = new Set(hashes);
    const members = await this.db.query<{ email: string }>(
      `
        SELECT DISTINCT lower(u.email) AS email
        FROM users u
        WHERE u.email IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM workspaces w
              WHERE w.id = $1 AND w.owner_id = u.id
            )
            OR EXISTS (
              SELECT 1 FROM workspace_members wm
              WHERE wm.workspace_id = $1 AND wm.user_id = u.id
            )
          )
      `,
      [workspaceId],
    );
    return members
      .map((row) => normalizeEmail(row.email))
      .filter((email) => email && hashSet.has(hashRecipient(email, this.config.sessionSecret)));
  }

  private async readWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<{ exists: boolean; canAccess: boolean; planTier: string | null }> {
    const rows = await this.db.query<{ exists: boolean; can_access: boolean; plan_tier: string | null }>(
      `
        SELECT
          TRUE AS exists,
          (w.owner_id = $2 OR wm.user_id IS NOT NULL) AS can_access,
          w.plan_tier
        FROM workspaces w
        LEFT JOIN workspace_members wm
          ON wm.workspace_id = w.id
         AND wm.user_id = $2
        WHERE w.id = $1
      `,
      [workspaceId, userId],
    );
    const row = rows[0];
    if (!row) {
      return { exists: false, canAccess: false, planTier: null };
    }
    return {
      exists: true,
      canAccess: Boolean(row.can_access),
      planTier: row.plan_tier,
    };
  }

  private async consumeOpenRateLimit(requestIp: string): Promise<void> {
    const key = `capsule:open:ip:${requestIp}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.config.capsuleRateLimitWindowSeconds);
    }
    if (count > this.config.capsuleOpenRateLimitPerIp) {
      throw new CapsuleServiceError("RATE_LIMITED", 429, "rate limited");
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
      deployEnv: this.config.deployEnv ?? "dev",
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
    throw new CapsuleServiceError(
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

function requestsCapsuleAccessSettings(input: {
  expiresAt?: string;
  activateAt?: string;
  deactivateAt?: string;
  deleteAt?: string;
  maxViews?: number;
  passwordAttemptLimit?: number;
  password?: string;
  allowedRecipientEmails?: string[];
  approvalRequired?: boolean;
}): boolean {
  return Boolean(
    input.expiresAt ||
      input.activateAt ||
      input.deactivateAt ||
      input.deleteAt ||
      input.maxViews !== undefined ||
      input.passwordAttemptLimit !== undefined ||
      (input.password && input.password.length > 0) ||
      (input.allowedRecipientEmails && input.allowedRecipientEmails.length > 0) ||
      input.approvalRequired,
  );
}

function parseBlobOrThrow(value: unknown, fieldName: string): EncryptedBlob {
  try {
    return parseEncryptedBlobInput(value, {
      fieldName,
      maxPayloadBytes: MAX_ENCRYPTED_PAYLOAD_BYTES,
      allowLegacyString: false,
    }).blob;
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("exceeds")) {
      throw new CapsuleServiceError("PAYLOAD_TOO_LARGE", 413, message);
    }
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, message);
  }
}

function normalizeOptionalIsoDate(iso?: string): string | null {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "lifecycle timestamp must be valid ISO date");
  }
  return new Date(parsed).toISOString();
}

function assertLifecycleOrder(
  activateAt: string | null,
  deactivateAt: string | null,
  deleteAt: string | null,
): void {
  if (activateAt && deactivateAt && Date.parse(deactivateAt) <= Date.parse(activateAt)) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "deactivateAt must be after activateAt");
  }
  if (deactivateAt && deleteAt && Date.parse(deleteAt) <= Date.parse(deactivateAt)) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "deleteAt must be after deactivateAt");
  }
  if (deleteAt && activateAt && Date.parse(deleteAt) <= Date.parse(activateAt)) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "deleteAt must be after activateAt");
  }
}

function normalizeViewLimitAction(value?: string): CapsuleViewLimitAction {
  if (!value || value === "deactivate") {
    return "deactivate";
  }
  if (value === "delete") {
    return "delete";
  }
  throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "invalid view limit action");
}

function normalizePasswordAttemptLimit(value: number | undefined, password: string | undefined): number | null {
  if (!password) {
    return null;
  }
  const normalized = value ?? 3;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "passwordAttemptLimit must be 1..100");
  }
  return normalized;
}

function normalizeMaxViews(maxViews?: number): number | null {
  if (maxViews === undefined) {
    return null;
  }
  if (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 10000) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      "maxViews must be an integer from 1 to 10000",
    );
  }
  return maxViews;
}

function buildAccessPolicy(
  password: string | undefined,
  allowedRecipientEmails: string[] | undefined,
  secret: string,
  keyTransportMode: CapsuleKeyTransportMode,
): CapsuleAccessPolicy {
  const policy: CapsuleAccessPolicy = { keyTransportMode };
  if (!password) {
    // no-op
  } else {
    if (password.length < 4) {
      throw new CapsuleServiceError(
        "CAPSULE_BAD_REQUEST",
        400,
        "password must be at least 4 characters",
      );
    }
    const salt = randomBytes(16).toString("base64");
    const hash = hashPassword(password, salt, secret);
    policy.password = {
      kdf: "scrypt-v1",
      salt,
      hash,
    };
  }

  if (allowedRecipientEmails && allowedRecipientEmails.length > 0) {
    const emails = Array.from(
      new Set(allowedRecipientEmails.map(normalizeEmail).filter(Boolean)),
    );
    const hashes = emails.map((email) => hashRecipient(email, secret));
    if (hashes.length > 0) {
      policy.allowedRecipientHashes = hashes;
      policy.allowedRecipientEmails = emails;
    }
  }
  return policy;
}

function assertSafeCapsuleKeyTransportMode(value: string | undefined): CapsuleKeyTransportMode {
  try {
    return normalizeCapsuleKeyTransportMode(value);
  } catch {
    throw new CapsuleServiceError(
      CAPSULE_UNSAFE_KEY_TRANSPORT,
      CAPSULE_UNSAFE_KEY_TRANSPORT_STATUS_CODE,
      "unsafe key transport is not allowed; use fragment or out_of_band",
    );
  }
}

function mapMetadata(capsule: CapsuleRow): CapsuleMetadataResponse {
  const policy = parsePolicy(capsule.access_policy);
  const effectiveState = capsuleEffectiveState(capsule);
  return {
    capsuleId: capsule.id,
    workspaceId: capsule.workspace_id,
    type: normalizeCapsuleType(capsule.type),
    state: effectiveState,
    activateAt: capsule.activate_at,
    deactivateAt: capsule.deactivate_at ?? capsule.expires_at,
    deleteAt: capsule.delete_at,
    maxViews: capsule.view_limit,
    viewCount: capsule.view_count,
    viewLimitAction: capsule.view_limit_action === "delete" ? "delete" : "deactivate",
    passwordRequired: Boolean(policy.password?.hash),
    passwordAttemptLimit: capsule.password_attempt_limit,
    recipientRestricted: Boolean(policy.allowedRecipientHashes?.length),
    approvalRequired: capsule.approval_required,
    createdAt: capsule.created_at,
    updatedAt: capsule.updated_at,
  };
}

function mapOwnerMetadata(capsule: CapsuleRow): CapsuleOwnerListEntryDto {
  const encryptedMetadata = capsule.encrypted_metadata ?? capsule.encrypted_payload;
  const ownerKeyWrap = capsule.owner_key_wrap ?? capsule.encrypted_payload;
  return {
    ...mapMetadata(capsule),
    encryptedMetadata: decodeEncryptedBlobFromStorage(Uint8Array.from(encryptedMetadata)),
    ownerKeyWrap: decodeEncryptedBlobFromStorage(Uint8Array.from(ownerKeyWrap)),
  };
}

function normalizeCapsuleType(type: string): CapsuleType {
  if (type === "file" || type === "item") {
    return type;
  }
  return "text";
}

function capsuleEffectiveState(capsule: CapsuleRow, nowMs = Date.now()): CapsuleState {
  if (capsule.state !== "active") {
    return "inactive";
  }
  if (capsule.view_limit !== null && capsule.view_count >= capsule.view_limit) {
    return "inactive";
  }
  if (capsule.activate_at && nowMs < Date.parse(String(capsule.activate_at))) {
    return "inactive";
  }
  const deactivateAt = capsule.deactivate_at ?? capsule.expires_at;
  if (deactivateAt && nowMs >= Date.parse(String(deactivateAt))) {
    return "inactive";
  }
  return "active";
}

function parsePolicy(raw: unknown): CapsuleAccessPolicy {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return raw as CapsuleAccessPolicy;
}

function ensureCapsuleAccessible(capsule: CapsuleRow): void {
  const policy = parsePolicy(capsule.access_policy);
  if (policy.revoked) {
    throw new CapsuleServiceError("CAPSULE_REVOKED", 410, "capsule revoked");
  }
  if (capsule.delete_at && Date.now() >= Date.parse(String(capsule.delete_at))) {
    throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
  }
  if (capsule.view_limit !== null && capsule.view_count >= capsule.view_limit) {
    throw new CapsuleServiceError(
      "CAPSULE_VIEW_LIMIT_EXCEEDED",
      410,
      "capsule view limit exceeded",
    );
  }
  if (capsuleEffectiveState(capsule) !== "active") {
    throw new CapsuleServiceError("CAPSULE_INACTIVE", 410, "capsule inactive");
  }
}

function validatePassword(capsule: CapsuleRow, password: string | undefined, secret: string): void {
  const policy = parsePolicy(capsule.access_policy);
  if (!policy.password?.hash || !policy.password.salt) {
    return;
  }
  if (!password) {
    throw new CapsuleServiceError(
      "CAPSULE_PASSWORD_REQUIRED",
      401,
      "password required",
    );
  }
  const expected = Buffer.from(policy.password.hash, "base64");
  const actual = Buffer.from(hashPassword(password, policy.password.salt, secret), "base64");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new CapsuleServiceError("CAPSULE_PASSWORD_INVALID", 403, "password invalid");
  }
}

function parseAttachmentFilePayloads(
  value: Record<string, unknown> | undefined,
  capsuleType: string,
): Record<string, Buffer> | null {
  if (capsuleType !== "item" || !value || typeof value !== "object") {
    return null;
  }
  const out: Record<string, Buffer> = {};
  for (const [assetId, blob] of Object.entries(value)) {
    const normalizedAssetId = assetId.trim();
    if (!normalizedAssetId) {
      continue;
    }
    out[normalizedAssetId] = serializeEncryptedBlobToStorage(
      mergeEncryptedBlobMeta(parseBlobOrThrow(blob, "attachmentFilePayloads"), {
        entity: "capsule_attachment_payload",
        capsule_type: capsuleType,
      }),
    );
  }
  return Object.keys(out).length > 0 ? out : null;
}

function validateRecipient(
  capsule: CapsuleRow,
  recipientEmail: string | undefined,
  secret: string,
): void {
  const policy = parsePolicy(capsule.access_policy);
  const list = policy.allowedRecipientHashes;
  if (!list || list.length === 0) {
    return;
  }
  if (!recipientEmail) {
    throw new CapsuleServiceError(
      "CAPSULE_RECIPIENT_REQUIRED",
      401,
      "recipient email required",
    );
  }
  const hash = hashRecipient(normalizeEmail(recipientEmail), secret);
  if (!list.includes(hash)) {
    throw new CapsuleServiceError(
      "CAPSULE_RECIPIENT_FORBIDDEN",
      403,
      "recipient is not allowed",
    );
  }
}

function hashPassword(password: string, saltBase64: string, secret: string): string {
  const salt = Buffer.from(saltBase64, "base64");
  const derived = scryptSync(password, Buffer.concat([salt, createHash("sha256").update(secret).digest()]), 32);
  return Buffer.from(derived).toString("base64");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashRecipient(email: string, secret: string): string {
  return createHash("sha256").update(`capsule-recipient:${email}:${secret}`).digest("base64");
}

function approvalTokenForRequest(requestId: string, secret: string): string {
  return createHmac("sha256", secret).update(`capsule-approval:${requestId}`).digest("base64url");
}

function hashApprovalToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(`capsule-approval-token:${token}`).digest("base64url");
}

function normalizeApprovalStatus(value: string): CapsuleApprovalStatusDto["status"] {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "denied" ||
    value === "consumed" ||
    value === "expired"
  ) {
    return value;
  }
  return "expired";
}

function parseUserAgent(userAgent: string | undefined): { deviceLabel: string; platform: string } {
  const value = userAgent ?? "";
  const platform = /Windows/iu.test(value)
    ? "Windows"
    : /Android/iu.test(value)
      ? "Android"
      : /iPhone|iPad/iu.test(value)
        ? "iOS"
        : /Macintosh|Mac OS/iu.test(value)
          ? "macOS"
          : /Linux/iu.test(value)
            ? "Linux"
            : "Unknown";
  const browser = /Edg\//u.test(value)
    ? "Edge"
    : /Firefox\//u.test(value)
      ? "Firefox"
      : /Chrome\//u.test(value)
        ? "Chrome"
        : /Safari\//u.test(value)
          ? "Safari"
          : "Unknown browser";
  return {
    deviceLabel: `${browser}${platform === "Unknown" ? "" : ` on ${platform}`}`,
    platform,
  };
}
