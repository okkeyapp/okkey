import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

const CAPSULE_TYPES = new Set(["item", "field", "file"]);
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
  >;
  users?: Pick<UsersRepository, "findById">;
  objectStorage: Pick<ObjectStorage, "putObject" | "getObject">;
  log?: Logger;
}

interface CapsuleRow {
  id: string;
  workspace_id: string;
  creator_id: string | null;
  type: string;
  encrypted_payload: Buffer;
  access_policy: unknown;
  expires_at: string | null;
  view_limit: number | null;
  view_count: number;
  created_at: string;
}

interface PasswordPolicy {
  kdf: "scrypt-v1";
  salt: string;
  hash: string;
}

interface CapsuleAccessPolicy {
  password?: PasswordPolicy;
  allowedRecipientHashes?: string[];
  fileStorageKey?: string;
  fileSizeBytes?: number;
  keyTransportMode?: CapsuleKeyTransportMode;
  revoked?: boolean;
  revokedAt?: string;
}

export interface CreateCapsuleInput {
  type: string;
  encryptedPayload: unknown;
  filePayload?: unknown;
  keyTransportMode?: string;
  expiresAt?: string;
  maxViews?: number;
  password?: string;
  allowedRecipientEmails?: string[];
}

export interface CapsuleMetadataResponse {
  capsuleId: string;
  type: string;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  passwordRequired: boolean;
  createdAt: string;
}

export interface OpenCapsuleResponse extends CapsuleMetadataResponse {
  encryptedPayload: EncryptedBlob;
  filePayload?: EncryptedBlob;
}

export class CapsuleService {
  private readonly db: CapsuleServiceDeps["db"];
  private readonly redis: CapsuleServiceDeps["redis"];
  private readonly config: CapsuleServiceDeps["config"];
  private readonly users: CapsuleServiceDeps["users"];
  private readonly objectStorage: CapsuleServiceDeps["objectStorage"];
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
    this.log = deps.log;
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
    const keyTransportMode = assertSafeCapsuleKeyTransportMode(input.keyTransportMode);
    const workspace = await this.readWorkspaceAccess(workspaceId, creatorId);
    if (!workspace.exists) {
      throw new CapsuleServiceError("WORKSPACE_NOT_FOUND", 404, "workspace not found");
    }
    if (!workspace.canAccess) {
      throw new CapsuleServiceError("ACCESS_DENIED", 403, "access denied");
    }
    if (workspace.planTier === "FREE") {
      throw new CapsuleServiceError("FEATURE_NOT_AVAILABLE", 403, "capsules are unavailable");
    }

    const expiresAt = normalizeFutureIsoDate(input.expiresAt);
    const maxViews = normalizeMaxViews(input.maxViews);
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
    const accessPolicy = buildAccessPolicy(
      input.password,
      input.allowedRecipientEmails,
      this.config.sessionSecret,
      keyTransportMode,
    );

    const rows = await this.db.transaction(async (tx) => {
      const inserted = await tx.query<CapsuleRow>(
        `
          INSERT INTO capsules (
            workspace_id,
            creator_id,
            type,
            encrypted_payload,
            access_policy,
            expires_at,
            view_limit,
            view_count
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7, 0)
          RETURNING
            id, workspace_id, creator_id, type, encrypted_payload, access_policy,
            expires_at, view_limit, view_count, created_at
        `,
        [
          workspaceId,
          creatorId,
          input.type,
          Buffer.from(payload),
          JSON.stringify(accessPolicy),
          expiresAt,
          maxViews,
        ],
      );
      const created = inserted[0];

      if (filePayload) {
        const storageKey = `capsules/${created.id}/file.bin`;
        await this.objectStorage.putObject(storageKey, filePayload);
        await tx.query(
          `
            INSERT INTO capsule_files (capsule_id, storage_key, size_bytes)
            VALUES ($1, $2, $3)
          `,
          [created.id, storageKey, filePayload.length],
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
        const withPolicy = await tx.query<CapsuleRow>(
          `
            SELECT
              id, workspace_id, creator_id, type, encrypted_payload, access_policy,
              expires_at, view_limit, view_count, created_at
            FROM capsules
            WHERE id = $1
          `,
          [created.id],
        );
        return withPolicy;
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

  async getCapsuleMetadata(capsuleId: string): Promise<CapsuleMetadataResponse> {
    const capsule = await this.loadCapsule(capsuleId);
    ensureCapsuleAccessible(capsule);
    return mapMetadata(capsule);
  }

  async openCapsule(
    capsuleId: string,
    requestIp: string,
    password?: string,
    recipientEmail?: string,
    keyTransportMode?: string,
  ): Promise<OpenCapsuleResponse> {
    await this.consumeOpenRateLimit(requestIp);
    assertSafeCapsuleKeyTransportMode(keyTransportMode);
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<CapsuleRow>(
        `
          SELECT
            id, workspace_id, creator_id, type, encrypted_payload, access_policy,
            expires_at, view_limit, view_count, created_at
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
      validatePassword(capsule, password, this.config.sessionSecret);
      validateRecipient(capsule, recipientEmail, this.config.sessionSecret);

      await tx.query(
        `
          UPDATE capsules
          SET view_count = view_count + 1, updated_at = now()
          WHERE id = $1
        `,
        [capsule.id],
      );

      const response: OpenCapsuleResponse = {
        ...mapMetadata({ ...capsule, view_count: capsule.view_count + 1 }),
        encryptedPayload: decodeEncryptedBlobFromStorage(Uint8Array.from(capsule.encrypted_payload)),
      };
      const policy = parsePolicy(capsule.access_policy);
      if (policy.fileStorageKey) {
        const filePayload = await this.objectStorage.getObject(policy.fileStorageKey);
        if (filePayload) {
          response.filePayload = decodeEncryptedBlobFromStorage(Uint8Array.from(filePayload));
        }
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

  private async loadCapsule(capsuleId: string): Promise<CapsuleRow> {
    const rows = await this.db.query<CapsuleRow>(
      `
        SELECT
          id, workspace_id, creator_id, type, encrypted_payload, access_policy,
          expires_at, view_limit, view_count, created_at
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

function normalizeFutureIsoDate(iso?: string): string | null {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "expiresAt must be valid ISO date");
  }
  if (parsed <= Date.now()) {
    throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "expiresAt must be in the future");
  }
  return new Date(parsed).toISOString();
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
    const hashes = Array.from(
      new Set(
        allowedRecipientEmails
          .map(normalizeEmail)
          .filter(Boolean)
          .map((email) => hashRecipient(email, secret)),
      ),
    );
    if (hashes.length > 0) {
      policy.allowedRecipientHashes = hashes;
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
  return {
    capsuleId: capsule.id,
    type: capsule.type,
    expiresAt: capsule.expires_at,
    maxViews: capsule.view_limit,
    viewCount: capsule.view_count,
    passwordRequired: Boolean(policy.password?.hash),
    createdAt: capsule.created_at,
  };
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
  if (capsule.expires_at && Date.now() > Date.parse(capsule.expires_at)) {
    throw new CapsuleServiceError("CAPSULE_EXPIRED", 410, "capsule expired");
  }
  if (capsule.view_limit !== null && capsule.view_count >= capsule.view_limit) {
    throw new CapsuleServiceError(
      "CAPSULE_VIEW_LIMIT_EXCEEDED",
      410,
      "capsule view limit exceeded",
    );
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
