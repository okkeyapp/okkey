import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  isCapsuleAllowedForMember,
  isCapsuleTypeAllowed,
  resolveEffectiveCapsulePolicies,
  sanitizePlanFeatureOverrides,
  workspaceCapsulePoliciesFromDto,
  type CapsuleListResponseDto,
  type CapsuleMetadataDto,
  type CapsuleOwnerDetailDto,
  type CapsuleOwnerListEntryDto,
  type CapsuleState,
  type CapsuleType,
  type CapsuleViewLimitAction,
  type PlanFeatureOverrides,
  type WorkspaceCapsulePolicies,
  type WorkspaceCapsulePoliciesDto,
} from "@okkey/types";
import { generateEntityId, isEntityId } from "../entity-id.ts";
import { getCapsuleAccessSettingsProvider } from "./access-settings-provider.ts";
import type { ApiConfig } from "../config.ts";
import { workspaceHasPlanFeature, workspacePlanFeatureWriteDecision } from "../plan-entitlements.ts";
import {
  PlanQuotaExceededError,
  type WorkspaceStorageQuotaService,
} from "../storage-quota/service.ts";
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
  isLoopbackIp,
  resolveClientIpForGeo,
  resolveEgressPublicIp,
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
    | "deploymentMode"
    | "enterpriseModulesEnabled"
  >;
  users?: Pick<UsersRepository, "findById">;
  objectStorage: Pick<ObjectStorage, "putObject" | "getObject" | "deleteObject">;
  /** When set, SaaS capsule writes are rejected once encrypted content exceeds the plan ceiling. */
  storageQuota?: WorkspaceStorageQuotaService;
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
  private readonly storageQuota: CapsuleServiceDeps["storageQuota"];
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
    this.storageQuota = deps.storageQuota;
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
    const ipAddress = await resolveClientIpForGeo(
      input.remoteAddress,
      input.forwardedFor,
      this.config.trustedProxyHops,
      this.log,
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
    if (!isEntityId(workspaceId.trim())) {
      throw new CapsuleServiceError("INVALID_WORKSPACE_ID", 400, "workspaceId must be a snowflake entity id");
    }
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
    if (!workspaceHasPlanFeature(this.config, workspace, "capsules")) {
      throw new CapsuleServiceError("FEATURE_NOT_AVAILABLE", 403, "capsules are unavailable");
    }
    const accessSettingsEnabled = workspaceHasPlanFeature(
      this.config,
      workspace,
      "capsuleAccessSettings",
    );
    const capsulePolicies = resolveEffectiveCapsulePolicies(
      workspace.capsulePolicies,
      accessSettingsEnabled,
    );
    if (!isCapsuleAllowedForMember(capsulePolicies, creatorId)) {
      throw new CapsuleServiceError("FEATURE_NOT_AVAILABLE", 403, "capsules are unavailable");
    }
    if (!isCapsuleTypeAllowed(capsulePolicies, input.type)) {
      throw new CapsuleServiceError(
        "CAPSULE_BAD_REQUEST",
        400,
        `capsule type "${input.type}" is not allowed by workspace policy`,
      );
    }
    this.assertFilesInCapsulesAllowed(workspace, input);
    const accessWrite = await this.resolveAccessWrite({
      mode: "create",
      actorId: creatorId,
      policies: capsulePolicies,
      accessSettingsEnabled,
      workspacePlan: workspace,
      input,
      keyTransportMode,
    });
    const activateAt = accessWrite.activateAt;
    const deactivateAt = accessWrite.deactivateAt;
    const deleteAt = accessWrite.deleteAt;
    const maxViews = accessWrite.maxViews;
    const viewLimitAction = accessWrite.viewLimitAction;
    const passwordAttemptLimit = accessWrite.passwordAttemptLimit;
    const accessPolicy = accessWrite.accessPolicy;
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
    await this.assertStorageQuota(
      workspaceId,
      workspace.planTier,
      payload.byteLength +
        encryptedMetadata.byteLength +
        (filePayload?.byteLength ?? 0) +
        byteLengthOfPayloads(attachmentFilePayloads),
      0,
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
          accessWrite.approvalRequired,
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
      const accessSettingsEnabled = workspaceHasPlanFeature(
        this.config,
        workspace,
        "capsuleAccessSettings",
      );
      const capsulePolicies = resolveEffectiveCapsulePolicies(
        workspace.capsulePolicies,
        accessSettingsEnabled,
      );
      if (!isCapsuleAllowedForMember(capsulePolicies, creatorId)) {
        throw new CapsuleServiceError("FEATURE_NOT_AVAILABLE", 403, "capsules are unavailable");
      }
      // Existing capsules of a now-disabled type stay visible but are not editable.
      const existingType = existing.type as CapsuleType;
      if (
        !isCapsuleTypeAllowed(capsulePolicies, existingType) ||
        !isCapsuleTypeAllowed(capsulePolicies, input.type)
      ) {
        throw new CapsuleServiceError(
          "CAPSULE_BAD_REQUEST",
          400,
          `capsule type "${existingType}" is not allowed by workspace policy`,
        );
      }
      this.assertFilesInCapsulesAllowed(workspace, input);
      const accessWrite = await this.resolveAccessWrite({
        mode: "update",
        actorId: creatorId,
        policies: capsulePolicies,
        accessSettingsEnabled,
        workspacePlan: workspace,
        input,
        keyTransportMode,
        existing: {
          accessPolicy: existing.access_policy,
          passwordAttemptLimit: existing.password_attempt_limit,
          approvalRequired: existing.approval_required,
          activateAt: existing.activate_at,
          deactivateAt: existing.deactivate_at,
          deleteAt: existing.delete_at,
          maxViews: existing.view_limit,
          viewLimitAction: existing.view_limit_action === "delete" ? "delete" : "deactivate",
        },
      });
      const activateAt = accessWrite.activateAt;
      const deactivateAt = accessWrite.deactivateAt;
      const deleteAt = accessWrite.deleteAt;
      const maxViews = accessWrite.maxViews;
      const viewLimitAction = accessWrite.viewLimitAction;
      const passwordAttemptLimit = accessWrite.passwordAttemptLimit;
      const existingPolicy = parsePolicy(existing.access_policy);
      const nextPolicy = accessWrite.accessPolicy;
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
      const replacedFileBytes =
        existingPolicy.fileStorageKey && (!keepFile || replacingFile)
          ? (existingPolicy.fileSizeBytes ?? 0)
          : 0;
      await this.assertStorageQuota(
        existing.workspace_id,
        workspace.planTier,
        payload.byteLength +
          encryptedMetadata.byteLength +
          (filePayload?.byteLength ?? 0) +
          byteLengthOfPayloads(attachmentFilePayloads),
        existing.encrypted_payload.byteLength +
          (existing.encrypted_metadata?.byteLength ?? 0) +
          replacedFileBytes,
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
            accessWrite.approvalRequired,
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

  async getCapsuleMetadata(capsuleId: string): Promise<CapsuleMetadataResponse> {
    const capsule = await this.loadCapsule(capsuleId);
    await this.assertWorkspaceCapsulesEnabled(capsule.workspace_id);
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
      await this.assertWorkspaceCapsulesEnabled(capsule.workspace_id);
      ensureCapsuleAccessible(capsule);
      const { approvalRequestId } = await this.assertOpenAccess(tx, capsule, {
        password,
        recipientEmail: sessionRecipientEmail,
        approvalToken,
        requesterUserId,
        guestSessionId,
        requestIp,
      });

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

  private async assertStorageQuota(
    workspaceId: string,
    planTier: string | null,
    additionalBytes: number,
    replacedBytes: number,
  ): Promise<void> {
    if (!this.storageQuota) {
      return;
    }
    try {
      await this.storageQuota.assertAdditionalBytes({
        workspace: { id: workspaceId, planTier },
        additionalBytes,
        replacedBytes,
      });
    } catch (error) {
      if (error instanceof PlanQuotaExceededError) {
        throw new CapsuleServiceError(error.code, error.statusCode, error.message, error.details);
      }
      throw error;
    }
  }

  private async readWorkspaceAccess(
    workspaceId: string,
    userId: string,
  ): Promise<{
    exists: boolean;
    canAccess: boolean;
    planTier: string | null;
    planCustomOverride: boolean;
    planFeatureOverrides: PlanFeatureOverrides;
    capsulePolicies: WorkspaceCapsulePolicies;
  }> {
    const rows = await this.db.query<{
      exists: boolean;
      can_access: boolean;
      plan_tier: string | null;
      plan_custom_override: boolean | null;
      plan_feature_overrides: unknown;
      capsule_policies: unknown;
    }>(
      `
        SELECT
          TRUE AS exists,
          (w.owner_id = $2 OR wm.user_id IS NOT NULL) AS can_access,
          w.plan_tier,
          w.plan_custom_override,
          w.plan_feature_overrides,
          w.capsule_policies
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
      return {
        exists: false,
        canAccess: false,
        planTier: null,
        planCustomOverride: false,
        planFeatureOverrides: {},
        capsulePolicies: workspaceCapsulePoliciesFromDto(undefined),
      };
    }
    return {
      exists: true,
      canAccess: Boolean(row.can_access),
      planTier: row.plan_tier,
      planCustomOverride: Boolean(row.plan_custom_override),
      planFeatureOverrides: sanitizePlanFeatureOverrides(row.plan_feature_overrides),
      capsulePolicies: workspaceCapsulePoliciesFromDto(
        row.capsule_policies as Partial<WorkspaceCapsulePoliciesDto> | undefined,
      ),
    };
  }

  private assertFilesInCapsulesAllowed(
    workspace: {
      planTier: string | null;
      planCustomOverride: boolean;
      planFeatureOverrides: PlanFeatureOverrides;
    },
    input: {
      type: string;
      filePayload?: unknown;
      attachmentFilePayloads?: Record<string, unknown>;
      keepExistingFile?: boolean;
    },
  ): void {
    if (!capsuleWriteAttachesFiles(input)) {
      return;
    }
    if (workspaceHasPlanFeature(this.config, workspace, "filesInCapsules")) {
      return;
    }
    throw new CapsuleServiceError(
      "FEATURE_NOT_AVAILABLE",
      403,
      "files in capsules are unavailable on this plan",
    );
  }

  private async assertWorkspaceCapsulesEnabled(workspaceId: string): Promise<void> {
    const rows = await this.db.query<{ capsule_policies: unknown }>(
      `SELECT capsule_policies FROM workspaces WHERE id = $1`,
      [workspaceId],
    );
    const policies = workspaceCapsulePoliciesFromDto(
      rows[0]?.capsule_policies as Partial<WorkspaceCapsulePoliciesDto> | undefined,
    );
    if (policies.allowMode === "none") {
      throw new CapsuleServiceError("CAPSULE_NOT_FOUND", 404, "capsule not found");
    }
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

  private async resolveAccessWrite(args: {
    mode: "create" | "update";
    actorId: string;
    policies: WorkspaceCapsulePolicies;
    accessSettingsEnabled: boolean;
    workspacePlan: {
      planTier: string | null;
      planCustomOverride: boolean;
      planFeatureOverrides: PlanFeatureOverrides;
    };
    input: CreateCapsuleInput | UpdateCapsuleInput;
    keyTransportMode: CapsuleKeyTransportMode;
    existing?: {
      accessPolicy: unknown;
      passwordAttemptLimit: number | null;
      approvalRequired: boolean;
      activateAt?: string | null;
      deactivateAt?: string | null;
      deleteAt?: string | null;
      maxViews?: number | null;
      viewLimitAction?: CapsuleViewLimitAction;
    };
  }): Promise<{
    accessPolicy: CapsuleAccessPolicy;
    activateAt: string | null;
    deactivateAt: string | null;
    deleteAt: string | null;
    maxViews: number | null;
    viewLimitAction: CapsuleViewLimitAction;
    passwordAttemptLimit: number | null;
    approvalRequired: boolean;
  }> {
    const input = coerceAccessWriteNumbers(args.input);
    enforceCapsulePoliciesOnWrite(args.policies, input);
    if (!requestsCapsuleAccessSettings(input, args.policies, args.accessSettingsEnabled)) {
      if (args.mode === "update" && args.existing) {
        const stored = parsePolicy(args.existing.accessPolicy);
        return {
          accessPolicy: { ...stored, keyTransportMode: args.keyTransportMode },
          activateAt: isoOrNull(args.existing.activateAt),
          deactivateAt: isoOrNull(args.existing.deactivateAt),
          deleteAt: isoOrNull(args.existing.deleteAt),
          maxViews:
            args.policies.forceMaxViews > 0
              ? args.policies.forceMaxViews
              : normalizeStoredCount(args.existing.maxViews),
          viewLimitAction: args.existing.viewLimitAction === "delete" ? "delete" : "deactivate",
          passwordAttemptLimit: normalizeStoredCount(args.existing.passwordAttemptLimit),
          approvalRequired: args.existing.approvalRequired === true,
        };
      }
      return {
        accessPolicy: { keyTransportMode: args.keyTransportMode },
        activateAt: null,
        deactivateAt: null,
        deleteAt: null,
        maxViews: args.policies.forceMaxViews > 0 ? args.policies.forceMaxViews : null,
        viewLimitAction: "deactivate",
        passwordAttemptLimit: null,
        approvalRequired: false,
      };
    }
    if (!args.accessSettingsEnabled) {
      const decision = workspacePlanFeatureWriteDecision(
        this.config,
        args.workspacePlan,
        "capsuleAccessSettings",
      );
      if (!decision.allowed && decision.code === "PLAN_LICENSE_LAPSED") {
        throw new CapsuleServiceError(decision.code, decision.status, decision.message);
      }
      throw new CapsuleServiceError(
        "FEATURE_NOT_AVAILABLE",
        403,
        "capsule access settings are unavailable on this plan",
      );
    }
    const provider = getCapsuleAccessSettingsProvider();
    if (!provider && input.approvalRequired) {
      throw new CapsuleServiceError(
        "FEATURE_NOT_AVAILABLE",
        403,
        "capsule access settings are unavailable on this plan",
      );
    }
    if (provider) {
      const prepared = await provider.prepareWrite({
        mode: args.mode,
        actorId: args.actorId,
        policies: args.policies,
        sessionSecret: this.config.sessionSecret,
        input,
        existing: args.existing,
      });
      if (!prepared || typeof prepared !== "object") {
        throw new CapsuleServiceError(
          "CAPSULE_BAD_REQUEST",
          400,
          "capsule access settings provider returned an empty result",
        );
      }
      const maxViews = normalizeStoredCount(prepared.maxViews);
      if (args.policies.forceMaxViews > 0 && maxViews !== args.policies.forceMaxViews) {
        throw new CapsuleServiceError(
          "CAPSULE_BAD_REQUEST",
          400,
          `maxViews must be ${args.policies.forceMaxViews}`,
        );
      }
      const accessPolicy =
        prepared.accessPolicy && typeof prepared.accessPolicy === "object"
          ? (prepared.accessPolicy as CapsuleAccessPolicy)
          : {};
      return {
        accessPolicy: { ...accessPolicy, keyTransportMode: args.keyTransportMode },
        activateAt: isoOrNull(prepared.activateAt),
        deactivateAt: isoOrNull(prepared.deactivateAt),
        deleteAt: isoOrNull(prepared.deleteAt),
        maxViews,
        viewLimitAction: prepared.viewLimitAction === "delete" ? "delete" : "deactivate",
        passwordAttemptLimit: normalizeStoredCount(prepared.passwordAttemptLimit),
        approvalRequired: prepared.approvalRequired === true,
      };
    }
    return hashAccessWrite(args.mode, input, args.keyTransportMode, args.existing, this.config.sessionSecret);
  }

  private async assertOpenAccess(
    tx: QueryExecutor,
    capsule: CapsuleRow,
    input: {
      password?: string;
      recipientEmail?: string;
      approvalToken?: string;
      requesterUserId?: string;
      guestSessionId?: string;
      requestIp: string;
    },
  ): Promise<{ approvalRequestId: string | null }> {
    if (!capsuleStoresAccessSettings(capsule)) {
      return { approvalRequestId: null };
    }
    const provider = getCapsuleAccessSettingsProvider();
    if (!provider) {
      try {
        validatePassword(capsule, input.password, this.config.sessionSecret);
      } catch (error) {
        if (
          error instanceof CapsuleServiceError &&
          error.code === "CAPSULE_PASSWORD_INVALID" &&
          capsule.password_attempt_limit
        ) {
          const attempts = await this.redis.incr(`capsule:password:${capsule.id}:${input.requestIp}`);
          if (attempts === 1) {
            await this.redis.expire(
              `capsule:password:${capsule.id}:${input.requestIp}`,
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
      validateRecipient(capsule, input.recipientEmail, this.config.sessionSecret);
      if (capsule.approval_required) {
        throw new CapsuleServiceError(
          "FEATURE_NOT_AVAILABLE",
          403,
          "capsule access settings are unavailable on this plan",
        );
      }
      return { approvalRequestId: null };
    }
    return provider.assertOpen({
      tx,
      capsule: {
        id: capsule.id,
        accessPolicy: capsule.access_policy,
        approvalRequired: capsule.approval_required,
        passwordAttemptLimit: capsule.password_attempt_limit,
      },
      password: input.password,
      recipientEmail: input.recipientEmail,
      approvalToken: input.approvalToken,
      requesterUserId: input.requesterUserId,
      guestSessionId: input.guestSessionId,
      requestIp: input.requestIp,
      sessionSecret: this.config.sessionSecret,
      redis: this.redis,
      passwordAttemptWindowSeconds: this.config.capsuleRateLimitWindowSeconds,
    });
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

function hashAccessWrite(
  mode: "create" | "update",
  input: {
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
    keepExistingPassword?: boolean;
    keepExistingRecipients?: boolean;
  },
  keyTransportMode: CapsuleKeyTransportMode,
  existing: { accessPolicy: unknown; passwordAttemptLimit: number | null } | undefined,
  sessionSecret: string,
): {
  accessPolicy: CapsuleAccessPolicy;
  activateAt: string | null;
  deactivateAt: string | null;
  deleteAt: string | null;
  maxViews: number | null;
  viewLimitAction: CapsuleViewLimitAction;
  passwordAttemptLimit: number | null;
  approvalRequired: boolean;
} {
  const activateAt = normalizeOptionalIsoDate(input.activateAt);
  const deactivateAt = normalizeOptionalIsoDate(input.deactivateAt ?? input.expiresAt);
  const deleteAt = normalizeOptionalIsoDate(input.deleteAt);
  assertLifecycleOrder(activateAt, deactivateAt, deleteAt);
  const existingPolicy = existing ? parsePolicy(existing.accessPolicy) : {};
  const accessPolicy = buildAccessPolicy(
    mode === "update" && input.keepExistingPassword ? undefined : input.password,
    mode === "update" && input.keepExistingRecipients ? undefined : input.allowedRecipientEmails,
    sessionSecret,
    keyTransportMode,
  );
  if (mode === "update" && input.keepExistingPassword && existingPolicy.password) {
    accessPolicy.password = existingPolicy.password;
  }
  if (mode === "update" && input.keepExistingRecipients && existingPolicy.allowedRecipientHashes?.length) {
    accessPolicy.allowedRecipientHashes = existingPolicy.allowedRecipientHashes;
    if (existingPolicy.allowedRecipientEmails?.length) {
      accessPolicy.allowedRecipientEmails = existingPolicy.allowedRecipientEmails;
    }
  }
  const passwordAttemptLimit =
    mode === "update" && input.keepExistingPassword
      ? normalizePasswordAttemptLimit(
          input.passwordAttemptLimit ?? existing?.passwordAttemptLimit ?? undefined,
          accessPolicy.password ? "kept" : undefined,
        )
      : normalizePasswordAttemptLimit(input.passwordAttemptLimit, input.password);
  return {
    accessPolicy,
    activateAt,
    deactivateAt,
    deleteAt,
    maxViews: normalizeMaxViews(input.maxViews),
    viewLimitAction: normalizeViewLimitAction(input.viewLimitAction),
    passwordAttemptLimit,
    approvalRequired: input.approvalRequired === true,
  };
}

function enforceCapsulePoliciesOnWrite(
  policies: WorkspaceCapsulePolicies,
  input: {
    maxViews?: number;
    deactivateAt?: string;
    expiresAt?: string;
    password?: string;
    passwordAttemptLimit?: number;
    allowedRecipientEmails?: string[];
    keepExistingPassword?: boolean;
    keepExistingRecipients?: boolean;
    approvalRequired?: boolean;
  },
): void {
  if (policies.forceMaxViews > 0 && input.maxViews !== policies.forceMaxViews) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      `maxViews must be ${policies.forceMaxViews}`,
    );
  }
  if (policies.requireTimeDeactivation && !input.deactivateAt && !input.expiresAt) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      "deactivateAt is required by workspace policy",
    );
  }
  if (
    policies.requireAccess &&
    !(input.allowedRecipientEmails && input.allowedRecipientEmails.length > 0) &&
    !input.keepExistingRecipients
  ) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      "allowedRecipientEmails is required by workspace policy",
    );
  }
  if (policies.requirePassword && !(input.password && input.password.length > 0) && !input.keepExistingPassword) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      "password is required by workspace policy",
    );
  }
  if (
    policies.passwordAttemptLimit > 0 &&
    input.passwordAttemptLimit !== undefined &&
    input.passwordAttemptLimit !== policies.passwordAttemptLimit
  ) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      `passwordAttemptLimit must be ${policies.passwordAttemptLimit}`,
    );
  }
  if (policies.requireApproval && !input.approvalRequired) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      "approvalRequired is required by workspace policy",
    );
  }
}

function normalizeOptionalIsoDate(iso?: string): string | null {
  if (!iso) return null;
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
  if (!value || value === "deactivate") return "deactivate";
  if (value === "delete") return "delete";
  throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "invalid view limit action");
}

function normalizePasswordAttemptLimit(value: number | undefined, password: string | undefined): number | null {
  if (!password) return null;
  const normalized = value ?? 3;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "passwordAttemptLimit must be 1..100");
  }
  return normalized;
}

function normalizeMaxViews(maxViews?: number): number | null {
  if (maxViews === undefined) return null;
  if (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 10000) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "maxViews must be an integer from 1 to 10000");
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
  if (password) {
    if (password.length < 4) {
      throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "password must be at least 4 characters");
    }
    const salt = randomBytes(16).toString("base64");
    policy.password = { kdf: "scrypt-v1", salt, hash: hashPassword(password, salt, secret) };
  }
  if (allowedRecipientEmails && allowedRecipientEmails.length > 0) {
    const emails = Array.from(new Set(allowedRecipientEmails.map(normalizeEmail).filter(Boolean)));
    const hashes = emails.map((email) => hashRecipient(email, secret));
    if (hashes.length > 0) {
      policy.allowedRecipientHashes = hashes;
      policy.allowedRecipientEmails = emails;
    }
  }
  return policy;
}

function isoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function coerceOptionalInt(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function normalizeStoredCount(value: unknown): number | null {
  const parsed = coerceOptionalInt(value);
  return parsed === undefined ? null : parsed;
}

function coerceAccessWriteNumbers<T extends { maxViews?: number; passwordAttemptLimit?: number }>(input: T): T {
  return {
    ...input,
    ...(input.maxViews !== undefined ? { maxViews: coerceOptionalInt(input.maxViews) } : {}),
    ...(input.passwordAttemptLimit !== undefined
      ? { passwordAttemptLimit: coerceOptionalInt(input.passwordAttemptLimit) }
      : {}),
  };
}

function requestsCapsuleAccessSettings(
  input: {
    expiresAt?: string;
    activateAt?: string;
    deactivateAt?: string;
    deleteAt?: string;
    maxViews?: number;
    viewLimitAction?: CapsuleViewLimitAction;
    passwordAttemptLimit?: number;
    password?: string;
    allowedRecipientEmails?: string[];
    approvalRequired?: boolean;
  },
  policies: WorkspaceCapsulePolicies,
  accessSettingsEnabled: boolean,
): boolean {
  const hasNonViewAccess =
    Boolean(input.expiresAt) ||
    Boolean(input.activateAt) ||
    Boolean(input.deactivateAt) ||
    Boolean(input.deleteAt) ||
    input.passwordAttemptLimit !== undefined ||
    Boolean(input.password && input.password.length > 0) ||
    Boolean(input.allowedRecipientEmails && input.allowedRecipientEmails.length > 0) ||
    Boolean(input.approvalRequired);

  if (hasNonViewAccess) {
    return true;
  }

  // Core "Limit views" may force maxViews on FREE; that alone is not an EE access setting.
  if (input.maxViews !== undefined || input.viewLimitAction !== undefined) {
    if (
      !accessSettingsEnabled &&
      policies.forceMaxViews > 0 &&
      input.maxViews === policies.forceMaxViews
    ) {
      return false;
    }
    return true;
  }

  return false;
}

function enforceForceMaxViews(
  policies: WorkspaceCapsulePolicies,
  input: { maxViews?: number },
): void {
  if (policies.forceMaxViews > 0 && input.maxViews !== policies.forceMaxViews) {
    throw new CapsuleServiceError(
      "CAPSULE_BAD_REQUEST",
      400,
      `maxViews must be ${policies.forceMaxViews}`,
    );
  }
}

function capsuleStoresAccessSettings(capsule: CapsuleRow): boolean {
  const policy = parsePolicy(capsule.access_policy);
  return Boolean(
    policy.password?.hash ||
      policy.allowedRecipientHashes?.length ||
      capsule.approval_required ||
      capsule.activate_at ||
      capsule.deactivate_at ||
      capsule.delete_at ||
      capsule.expires_at,
  );
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

/** True when a create/update would store or keep a capsule file or item attachment. */
function capsuleWriteAttachesFiles(input: {
  type: string;
  filePayload?: unknown;
  attachmentFilePayloads?: Record<string, unknown>;
  keepExistingFile?: boolean;
}): boolean {
  if (input.type === "file" || input.keepExistingFile === true) {
    return true;
  }
  if (input.filePayload != null) {
    return true;
  }
  const attachments = input.attachmentFilePayloads;
  if (!attachments || typeof attachments !== "object") {
    return false;
  }
  return Object.keys(attachments).some((assetId) => assetId.trim().length > 0);
}

function byteLengthOfPayloads(payloads: Record<string, Uint8Array | Buffer> | null): number {
  if (!payloads) {
    return 0;
  }
  let total = 0;
  for (const value of Object.values(payloads)) {
    total += value.byteLength;
  }
  return total;
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
