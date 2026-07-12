export type { EntityId, UUID } from "./entity-id.js";
export {
  ENTITY_ID_RE,
  assertEntityId,
  entityIdFromDb,
  generateEntityId,
  isEntityId,
} from "./entity-id.js";
import type { EntityId } from "./entity-id.js";

export interface User {
  id: EntityId;
  email: string;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_DELETED_ITEMS_RETENTION_DAYS = 30 as const;

export interface Workspace {
  id: EntityId;
  name: string;
  ownerId: EntityId;
  planTier: string;
  /** Days before soft-deleted vault items are permanently purged from the server. */
  deletedItemsRetentionDays: number;
  /** Hex tile color when no custom logo is set. */
  tileColor?: string | null;
  /** Vault storing the encrypted workspace logo attachment. */
  logoVaultId?: string | null;
  /** Encrypted logo attachment id. */
  logoAttachmentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vault {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  isPersonal: boolean;
  ownerId?: EntityId | null;
  /** Vault crypto profile floor; never decreases (server-enforced). */
  cryptoVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: EntityId;
  vaultId: EntityId;
  encryptedData: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export {
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  type ItemPlaintextV1,
} from "./item-plaintext-v1.js";

import type { ItemFaviconSource, ItemPlaintextV2 } from "./item-schema/types.js";
export type { ItemPlaintextV2, ItemFaviconSource };
export {
  ITEM_PLAINTEXT_SCHEMA_VERSION_V1,
  ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  ITEM_CATEGORY_LOGIN,
  ITEM_CATEGORY_SECURE_NOTE,
  ITEM_CATEGORY_CREDIT_CARD,
  createPresetItemPlaintextV2,
  parseAndNormalizeItemPlaintextUtf8,
  migrateItemPlaintextV1ToV2,
  validateItemPlaintextV2,
  normalizeItemPlaintextV2,
  createItemDeleteTombstoneV2,
  listCategoryIds,
  getCategoryDefinition,
  getFieldTypeDefinition,
  listRegisteredFieldTypes,
  ITEM_CATEGORY_DEFINITIONS,
} from "./item-schema/index.js";

export type {
  FolderPlaintextV1,
  FolderPlaintextV2,
  ItemFolderAssignPlaintextV1,
  ItemFolderAssignPlaintextV2,
  ItemFavoriteSetPlaintextV2,
} from "./folder-schema/types.js";
export {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
  ITEM_FAVORITE_SET_SCHEMA_VERSION_V2,
  parseFolderPlaintextUtf8,
  parseFolderPlaintextV2Utf8,
  parseItemFolderAssignPlaintextUtf8,
  parseItemFolderAssignPlaintextV2Utf8,
  parseItemFavoriteSetPlaintextV2Utf8,
  createFolderDeleteTombstoneV1,
  createFolderDeleteTombstoneV2,
} from "./folder-schema/index.js";

export interface Device {
  id: EntityId;
  userId: EntityId;
  deviceName: string;
  devicePublicKey: string;
  createdAt: string;
  lastSeenAt?: string | null;
}

export type CryptoRolloutMode = "strict" | "compat";

export interface ClientCryptoCapabilities {
  /** Client can process hybrid ECC+PQ envelopes and key transport for crypto v2 writes. */
  pqDevice: boolean;
  /** Client has PQ identity material available for strict write paths. */
  pqIdentity: boolean;
}

export function isClientPqCapable(
  capabilities: Partial<ClientCryptoCapabilities> | undefined,
): boolean {
  return capabilities?.pqDevice === true && capabilities?.pqIdentity === true;
}

export interface Session {
  id: EntityId;
  userId: EntityId;
  deviceId?: EntityId | null;
  expiresAt: string;
  createdAt: string;
}

export const EVENT_TYPES = [
  "ITEM_CREATE",
  "ITEM_UPDATE",
  "ITEM_DELETE",
  "FOLDER_CREATE",
  "FOLDER_UPDATE",
  "FOLDER_DELETE",
  "ITEM_FOLDER_ASSIGN",
  "ITEM_FAVORITE_SET",
  "VAULT_CREATE",
  "VAULT_SHARE",
  "VAULT_KEY_ROTATION",
  "DEVICE_ADD",
  "DEVICE_REMOVE",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type EventPayloadEncoding = "base64";

export type SyncConflictCode = "VERSION_MISMATCH" | "EVENT_GAP";

export interface EventActor {
  userId: EntityId;
  deviceId?: EntityId | null;
}

export interface SyncEvent {
  id: EntityId;
  workspaceId: EntityId;
  vaultId: EntityId;
  eventType: EventType;
  actor: EventActor;
  payloadCiphertext: string;
  payloadEncoding: EventPayloadEncoding;
  payloadSchemaVersion: number;
  idempotencyKey: EntityId;
  baseVersion: number;
  version: number;
  createdAt: string;
  clientCreatedAt?: string | null;
}

export type EventLogEntry = SyncEvent;

export interface FetchEventsQuery {
  vaultId: EntityId;
  afterVersion: number;
  limit?: number;
}

export interface FetchEventsResult {
  vaultId: EntityId;
  events: SyncEvent[];
  latestVersion: number;
  hasMore: boolean;
}

export interface AppendEventRequest {
  vaultId: EntityId;
  eventType: EventType;
  payloadCiphertext: string;
  payloadEncoding: EventPayloadEncoding;
  payloadSchemaVersion: number;
  idempotencyKey: EntityId;
  baseVersion: number;
  clientCreatedAt?: string | null;
}

export interface AppendEventResult {
  event: SyncEvent;
  latestVersion: number;
}

export interface SyncConflictErrorDetails {
  code: SyncConflictCode;
  vaultId: EntityId;
  expectedBaseVersion: number;
  latestVersion: number;
}

/**
 * JSON body returned by Core API on non-2xx responses (`services/api`).
 *
 * Common `error` values for crypto policy: `CRYPTO_PROFILE_NOT_ALLOWED` (env allowlist),
 * `CRYPTO_DOWNGRADE_NOT_ALLOWED` (vault event stream would move to a weaker profile),
 * `CRYPTO_CAPABILITY_REQUIRED` (strict rollout mode requires PQ-capable user/device).
 */
export interface CoreApiErrorBody {
  error: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export { assertCryptoVersionNotBelowFloor } from "./crypto-anti-downgrade.js";

/** Canonical encrypted wire/storage envelope for all ciphertext artifacts. */
export interface EncryptedBlobDto {
  crypto_version: number;
  algorithm: string;
  payload: string;
  meta: Record<string, unknown>;
}

/** Canonical hybrid signature envelope for integrity-critical artifacts. */
export interface HybridSignatureEnvelopeDto {
  version: 1;
  algorithm: "hybrid_ed25519_pq_bind_v1";
  key_id: string;
  context:
    | "sync.append"
    | "vault.share"
    | "vault.revoke"
    | "vault.rotate"
    | "vault.member_role_update";
  signer_pq_public_key: string;
  payload_hash: string;
  signature: string;
  created_at: string;
}

/** @deprecated Use {@link CoreApiErrorBody}; the wire field is `error`, not `code`. */
export type ApiError = CoreApiErrorBody;

/** `POST /auth/email/start` and `POST /auth/email/resend` success body. */
export interface EmailAuthStartResponse {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
}

/** `POST /auth/email/confirm` success body. */
export interface EmailAuthConfirmResponse {
  authStateId: string;
  userExists: boolean;
  nextStep: "registration" | "device_check" | "two_factor";
}

/** `POST /auth/session/bootstrap` and `POST /auth/two-factor/verify` success (snake_case on wire). */
export interface AccessTokenResponseDto {
  access_token: string;
  expires_at: string;
  user_id: EntityId;
  token_type: "Bearer";
}

/** `GET /auth/two-factor/status` success body. */
export interface TwoFactorStatusResponseDto {
  enabled: boolean;
  backupCodesRemaining: number;
}

/** `POST /auth/two-factor/totp/enroll/start` success body. */
export interface TotpEnrollStartResponseDto {
  enrollmentId: string;
  secretBase32: string;
  otpauthUri: string;
  periodSeconds: number;
  digits: number;
  algorithm: "SHA1";
}

/** `POST /auth/two-factor/totp/enroll/confirm` request. */
export interface TotpEnrollConfirmRequestDto {
  enrollmentId: string;
  code: string;
}

/** `POST /auth/two-factor/backup-codes/regenerate` request. */
export interface BackupCodesRegenerateRequestDto {
  totpCode: string;
}

/** `POST /auth/two-factor/disable` request (provide totpCode xor backupCode). */
export interface TwoFactorDisableRequestDto {
  totpCode?: string;
  backupCode?: string;
}

/** Plaintext backup codes returned once after enroll / regenerate. */
export interface BackupCodesPlaintextResponseDto {
  backupCodes: string[];
}

/** One event as returned by sync HTTP API (opaque base64 payload). */
export interface SyncEventWireDto {
  id: EntityId;
  vaultId: EntityId;
  actorId: EntityId | null;
  eventType: string;
  encryptedBlob: EncryptedBlobDto;
  signature?: HybridSignatureEnvelopeDto;
  idempotencyKey: EntityId | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}

/** `GET /vaults/:vaultId/events` success body. */
export interface SyncEventsListResponseDto {
  vaultId: EntityId;
  afterVersion: number;
  events: SyncEventWireDto[];
}

/** Workspace personal metadata event on the wire. */
export interface WorkspacePersonalEventWireDto {
  id: EntityId;
  workspaceId: EntityId;
  actorId: EntityId;
  eventType: string;
  encryptedBlob: EncryptedBlobDto;
  idempotencyKey: EntityId | null;
  clientCreatedAt: string | null;
  version: number;
  createdAt: string;
}

/** `GET /workspaces/:workspaceId/personal-events` success body. */
export interface WorkspacePersonalEventsListResponseDto {
  workspaceId: EntityId;
  userId: EntityId;
  afterVersion: number;
  events: WorkspacePersonalEventWireDto[];
}

/** `POST /vaults/:vaultId/events` request body. */
export interface SyncAppendEventRequestDto {
  eventType: string;
  encryptedBlob: EncryptedBlobDto;
  /** Required for integrity-critical event types (`VAULT_SHARE`, `VAULT_KEY_ROTATION`). */
  signature?: HybridSignatureEnvelopeDto;
  baseVersion: number;
  /** Required for `ITEM_CREATE`; optional for other types. Must be EntityId when set. */
  idempotencyKey?: string;
  clientCreatedAt?: string;
  /** Opaque item id for server-side retention purge (never decrypted by server). */
  referencedItemId?: EntityId;
  /** Soft-delete hint for `ITEM_*` events; server uses this for retention indexing only. */
  itemSoftDeleted?: boolean;
  /** Epoch ms when item was soft-deleted; required when `itemSoftDeleted` is true. */
  itemDeletedAtMs?: number;
}

/** `GET /workspaces/:workspaceId/settings` success body. */
export interface WorkspaceSettingsResponseDto {
  name: string;
  deleted_items_retention_days: number;
  tile_color: string | null;
  logo_vault_id: string | null;
  logo_attachment_id: string | null;
}

/** `PATCH /workspaces/:workspaceId/settings` request body. */
export interface WorkspaceSettingsUpdateRequestDto {
  name?: string;
  deleted_items_retention_days?: number;
  tile_color?: string | null;
  logo_vault_id?: string | null;
  logo_attachment_id?: string | null;
}

/** `DELETE /workspaces/:workspaceId/settings` request body. */
export interface WorkspaceDeleteRequestDto {
  confirmation_name: string;
}

/** `GET /vaults/:vaultId/key` success body. */
export interface VaultKeyGetResponseDto {
  encryptedVaultKey: EncryptedBlobDto;
}

export interface VaultShareMemberDto {
  userId: EntityId;
  email: string;
  /** Ed25519 public key (base64). */
  publicKey: string;
  /** ML-KEM-768 encapsulation key (base64); null for legacy users. */
  publicPqKey: string | null;
  role: string | null;
  encryptedVaultKey: EncryptedBlobDto | null;
}

/** `GET /vaults/:vaultId/shares` success body. */
export interface VaultSharesListResponseDto {
  vaultId: EntityId;
  members: VaultShareMemberDto[];
}

/** `POST /vaults/:vaultId/shares` request body. */
export interface VaultShareUpsertRequestDto {
  recipientUserId: EntityId;
  /**
   * Recipient wrapped vault key.
   * Production hybrid-by-default contract expects:
   * - `crypto_version >= 2`
   * - `meta.key_wrap_scheme = "hybrid_ecc_pq_v1"`
   */
  encryptedVaultKey: EncryptedBlobDto;
  encryptedPayload: EncryptedBlobDto;
  /** Required. */
  signature?: HybridSignatureEnvelopeDto;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  role?: string;
}

export interface VaultRotatedKeyDto {
  userId: EntityId;
  /** Same hybrid-by-default constraints as `VaultShareUpsertRequestDto.encryptedVaultKey`. */
  encryptedVaultKey: EncryptedBlobDto;
}

/** `POST /vaults/:vaultId/shares/revoke` request body. */
export interface VaultShareRevokeRequestDto {
  recipientUserId: EntityId;
  rotatedVaultKeys: VaultRotatedKeyDto[];
  encryptedPayload: EncryptedBlobDto;
  /** Required. */
  signature?: HybridSignatureEnvelopeDto;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

/**
 * `POST /vaults/:vaultId/key/rotate` request body.
 * Used for security incident and manual rotation triggers.
 * Client must supply freshly re-wrapped vault keys for ALL active recipients.
 */
export interface VaultKeyRotateRequestDto {
  rotatedVaultKeys: VaultRotatedKeyDto[];
  encryptedPayload: EncryptedBlobDto;
  /** Required. */
  signature?: HybridSignatureEnvelopeDto;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  reason?: "security_incident" | "manual";
}

/**
 * `PATCH /vaults/:vaultId/shares/:userId` request body.
 * Updates a member's role and atomically rotates the vault key.
 * Client must supply freshly re-wrapped vault keys for ALL active recipients.
 */
export interface VaultMemberRoleUpdateRequestDto {
  newRole: string;
  rotatedVaultKeys: VaultRotatedKeyDto[];
  encryptedPayload: EncryptedBlobDto;
  /** Required. */
  signature?: HybridSignatureEnvelopeDto;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
}

export interface CapsuleMetadataDto {
  capsuleId: EntityId;
  type: "item" | "field" | "file";
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  passwordRequired: boolean;
  createdAt: string;
}

export interface CapsuleOpenResponseDto extends CapsuleMetadataDto {
  encryptedPayload: EncryptedBlobDto;
  filePayload?: EncryptedBlobDto;
}

export interface CapsuleCreateRequestDto {
  type: "item" | "field" | "file";
  encryptedPayload: EncryptedBlobDto;
  filePayload?: EncryptedBlobDto;
  expiresAt?: string;
  maxViews?: number;
  password?: string;
  allowedRecipientEmails?: string[];
}

/** Optional nested metadata (same semantics as `POST /devices/register`). */
export interface RegisterCompleteMetadataDto {
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  crypto_capable?: boolean;
}

/** `POST /devices/register` request body (snake_case on wire). */
export interface DeviceRegisterRequestDto {
  device_public_key: string;
  device_share: string;
  device_fingerprint: string;
  device_name: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  metadata?: RegisterCompleteMetadataDto;
}

/** `POST /devices/register` success body (snake_case on wire). */
export interface DeviceRegisterResponseDto {
  device_id: EntityId;
  status: "trusted" | "pending_approval";
}

/** `POST /devices/:deviceId/reject` success body. */
export interface DeviceRejectResponseDto {
  device_id: EntityId;
  status: "revoked";
}

/** `POST /auth/register/complete` request body (snake_case on wire). */
export interface RegisterCompleteRequestDto {
  auth_state_id: EntityId;
  user_public_key: string;
  /** ML-KEM-768 encapsulation key (1184 raw bytes), standard base64. */
  user_public_pq_key: string;
  encrypted_private_key: EncryptedBlobDto;
  server_key_share: string;
  password_kdf_salt: string;
  password_kdf_params_version: number;
  device_public_key: string;
  device_share: string;
  device_fingerprint: string;
  device_name: string;
  /** Optional label for default workspace + personal vault; server default is `Personal`. */
  personal_workspace_name?: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  metadata?: RegisterCompleteMetadataDto;
  /** Optional; stored server-side to restore UI after clearing browser storage. */
  first_name?: string;
  last_name?: string;
}

/** `POST /auth/register/complete` success body (snake_case on wire). */
export interface RegisterCompleteResponseDto {
  user_id: EntityId;
  workspace_id: EntityId;
  vault_id: EntityId;
  device_id: EntityId;
  device_status: "trusted";
  access_token: string;
  expires_at: string;
  token_type: "Bearer";
}

/** `GET /account/profile` (Bearer) — non-sensitive display fields for UI. */
export interface AccountProfileResponseDto {
  email: string;
  first_name: string | null;
  last_name: string | null;
  locale: string | null;
  billing_region: string | null;
  /** Inactivity timeout before vault locks on device (seconds); server default 900 (15 min). */
  vault_idle_lock_seconds: number;
}

/** `PATCH /account/profile` (Bearer) — non-sensitive account preferences. */
export interface AccountProfileUpdateRequestDto {
  first_name?: string | null;
  last_name?: string | null;
  locale?: string | null;
  billing_region?: string | null;
}

/** `POST /account/email-change/start` and `/resend` success body. */
export interface AccountEmailChangeStartResponseDto {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
}

/** `POST /account/email-change/start` request body. */
export interface AccountEmailChangeStartRequestDto {
  email: string;
  locale?: string;
}

/** `POST /account/email-change/resend` request body. */
export interface AccountEmailChangeResendRequestDto {
  challengeId: string;
  locale?: string;
}

/** `POST /account/email-change/confirm` request body. */
export interface AccountEmailChangeConfirmRequestDto {
  challengeId: string;
  code: string;
}

/** `POST /account/email-change/confirm` success body. */
export interface AccountEmailChangeConfirmResponseDto {
  email: string;
}

/** `GET /vault/unlock-bootstrap?device_fingerprint=...` (Bearer) — split-key material to re-hydrate the client. */
export interface VaultUnlockBootstrapResponseDto {
  server_key_share: string;
  device_share: string;
  password_kdf_salt: string;
  password_kdf_params_version: number;
  encrypted_private_key: EncryptedBlobDto;
}

/** `GET /workspaces/:workspaceId/item-category-preferences` (Bearer). */
export interface WorkspaceItemCategoryPreferencesResponseDto {
  favorite_category_ids: string[];
  favorite_template_ids: string[];
  favorite_order: string[];
}

/** `PUT /workspaces/:workspaceId/item-category-preferences` (Bearer). */
export interface WorkspaceItemCategoryPreferencesUpdateRequestDto {
  favorite_category_ids: string[];
  favorite_template_ids: string[];
  favorite_order: string[];
}

export interface WorkspaceItemTemplatePayloadDto {
  record_name: string;
  vault_id: EntityId;
  folder_id: string;
  sections: unknown[];
  tags: string[];
  favicon_source?: ItemFaviconSource;
}

export interface WorkspaceItemTemplateDto {
  id: EntityId;
  name: string;
  category_id: string;
  payload: WorkspaceItemTemplatePayloadDto;
  favicon_id?: EntityId;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceItemTemplatesListResponseDto {
  templates: WorkspaceItemTemplateDto[];
}

export interface WorkspaceItemTemplateCreateRequestDto {
  id: EntityId;
  name: string;
  category_id: string;
  payload: WorkspaceItemTemplatePayloadDto;
  favicon_id?: EntityId;
}

export interface WorkspaceItemTemplateCreateResponseDto {
  template: WorkspaceItemTemplateDto;
}

export interface WorkspaceItemTemplateUpdateRequestDto {
  name: string;
  category_id: string;
  payload: WorkspaceItemTemplatePayloadDto;
  favicon_id?: EntityId | null;
}

export interface WorkspaceItemTemplateUpdateResponseDto {
  template: WorkspaceItemTemplateDto;
}
