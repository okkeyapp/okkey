export type { EntityId, UUID } from "./entity-id.js";
export {
  ENTITY_ID_RE,
  assertEntityId,
  entityIdFromDb,
  generateEntityId,
  isEntityId,
} from "./entity-id.js";
import type { EntityId } from "./entity-id.js";
import type { EncryptedBlobDto, HybridSignatureEnvelopeDto } from "./crypto-wire.js";
import type { PlanFeatureOverrides, PlanTier } from "./plan-features.js";
import type { WorkspaceBuiltInRoleDto } from "./workspace-roles.js";
import type { WorkspaceCapsulePolicies } from "./workspace-capsule-policies.js";
import type { WorkspaceCapsulePoliciesDto } from "./workspace-capsule-policies.js";
import type { WorkspaceMonitoringCardSettings } from "./workspace-monitoring-card-settings.js";
import type { WorkspaceMonitoringCardSettingsDto } from "./workspace-monitoring-card-settings.js";

export type { EncryptedBlobDto, HybridSignatureEnvelopeDto } from "./crypto-wire.js";

export type {
  DeploymentMode,
  PlanCatalogGroup,
  PlanCustomOverride,
  PlanEntitlementOptions,
  PlanFeature,
  PlanFeatureOverrides,
  PlanQuotaLimits,
  PlanTier,
} from "./plan-features.js";
export {
  PLAN_CATALOG_BUSINESS,
  PLAN_CATALOG_PERSONAL,
  PLAN_FEATURES,
  PLAN_FEATURE_MATRIX,
  PLAN_QUOTA_LIMITS,
  PLAN_TIER_RANK,
  PLAN_TIERS,
  SELF_HOSTED_FREE_EXTRA,
  canRequestPlanUpgrade,
  comparePlanTiers,
  emptyPlanFeatureOverrides,
  getPlanQuotaLimits,
  hasPlanFeature,
  isPlanTier,
  normalizePlanTier,
  planCatalogGroupForTier,
  planEntitlementOptionsFromWorkspace,
  planTiersForCatalogGroup,
  resolveEntitlementPlanTier,
  resolvePlanFeatures,
  sanitizePlanFeatureOverrides,
} from "./plan-features.js";

export type {
  AccountRecoveryEntitlements,
  AccountRecoveryWorkspaceLike,
  TrustedDeviceGateItem,
} from "./account-recovery-entitlements.js";
export {
  canEnableTrustedDevicesRecovery,
  MIN_TRUSTED_CONTACTS_CONFIRMED,
  MIN_TRUSTED_DEVICES_FOR_RECOVERY,
  resolveAccountRecoveryEntitlements,
} from "./account-recovery-entitlements.js";

export type {
  AccountSecurityColorBand,
  AccountSecurityFactorId,
  AccountSecurityLevel,
  AccountSecurityRecommendation,
  AccountSecurityRecommendationId,
  AccountSecurityRecommendationTarget,
  AccountSecurityScoreInput,
  AccountSecurityScoreResult,
} from "./account-security-score.js";
export {
  ACCOUNT_SECURITY_BACKUP_CODES_LOW_THRESHOLD,
  ACCOUNT_SECURITY_EXPORT_FRESH_DAYS,
  ACCOUNT_SECURITY_EXPORT_STALE_DAYS,
  ACCOUNT_SECURITY_FACTOR_WEIGHTS,
  ACCOUNT_SECURITY_MASTER_PASSWORD_MAX_AGE_DAYS,
  ACCOUNT_SECURITY_MAX_RECOMMENDATIONS,
  ACCOUNT_SECURITY_VAULT_CLIPBOARD_MAX_SECONDS,
  ACCOUNT_SECURITY_VAULT_IDLE_MAX_SECONDS,
  computeAccountSecurityScore,
} from "./account-security-score.js";

export interface User {
  id: EntityId;
  email: string;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_DELETED_ITEMS_RETENTION_DAYS = 30 as const;

export {
  DEFAULT_ALLOWED_FILE_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE_MB,
  MAX_MAX_FILE_SIZE_MB,
  MIN_MAX_FILE_SIZE_MB,
  formatMaxFileSizeMb,
  maxFileSizeBytesFromMb,
  normalizeAllowedFileExtensions,
  normalizeFileExtensionTag,
  normalizeMaxFileSizeMbInput,
  parseMaxFileSizeMbFromInput,
  clampMaxFileSizeMb,
  resolveMaxFileSizeMbFromInput,
} from "./workspace-file-upload.js";

export interface Workspace {
  id: EntityId;
  name: string;
  ownerId: EntityId;
  planTier: PlanTier;
  /**
   * When true, {@link planFeatureOverrides} selectively replace catalog matrix cells
   * (“by request” / custom commercial plan). Catalog {@link planTier} stays for display/billing.
   */
  planCustomOverride: boolean;
  /** Sparse feature overrides applied only when {@link planCustomOverride} is true. */
  planFeatureOverrides: PlanFeatureOverrides;
  /** Days before soft-deleted vault items are permanently purged from the server. */
  deletedItemsRetentionDays: number;
  /** Lowercase extensions allowed for item file uploads; empty means any extension. */
  allowedFileExtensions: string[];
  /** Maximum item file upload size in megabytes. */
  maxFileSizeMb: number;
  /** When false, users cannot add file fields or upload files in items. */
  filesInItemsEnabled: boolean;
  /** Workspace-level capsule admin policies. */
  capsulePolicies: WorkspaceCapsulePolicies;
  /** Workspace-wide monitoring card visibility / feature toggles. */
  monitoringCardSettings: WorkspaceMonitoringCardSettings;
  /** Hex tile color when no custom logo is set. */
  tileColor?: string | null;
  /** Vault storing the encrypted workspace logo attachment. */
  logoVaultId?: string | null;
  /** Encrypted logo attachment id. */
  logoAttachmentId?: string | null;
  /**
   * When set, a plan-change / license purchase request email was already sent for this workspace.
   * ISO timestamp string from the API.
   */
  planChangeRequestSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vault {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  /** Short description shown in settings lists. */
  description: string;
  /** Unicode emoji used as vault icon in UI. */
  icon: string;
  isPersonal: boolean;
  ownerId?: EntityId | null;
  /** Vault crypto profile floor; never decreases (server-enforced). */
  cryptoVersion: number;
  /** Members with vault access (membership + profile); omitted on some endpoints. */
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export { DEFAULT_PERSONAL_VAULT_NAME } from "./vault-defaults.js";

/** `POST /workspaces/:workspaceId/vaults` request body. */
export interface VaultCreateRequestDto {
  name: string;
  description?: string;
  icon?: string;
  /** Opaque event payload for `VAULT_CREATE` (client-encrypted). */
  encryptedPayload: EncryptedBlobDto;
  signature?: HybridSignatureEnvelopeDto;
  baseVersion?: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
  members: VaultCreateMemberDto[];
}

export interface VaultCreateMemberDto {
  userId: EntityId;
  /** Content access profile; omit / null = no access (should not appear in create members). */
  profileId: EntityId;
  encryptedVaultKey: EncryptedBlobDto;
  /** Vault share-manager role; default `member`, creator typically `owner`. */
  role?: string;
}

/** `PATCH /vaults/:vaultId` request body. */
export interface VaultUpdateRequestDto {
  name?: string;
  description?: string;
  icon?: string;
}

/** Actor reference for member audit trails (inviter / role changer). */
export interface WorkspaceMemberActorRefDto {
  userId: EntityId;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export type WorkspaceMemberStatus = "active" | "pending";

/** `GET /workspaces/:workspaceId/members` member or pending-invite row. */
export interface WorkspaceMemberDto {
  /** Null for pending invitations (no user yet). */
  userId: EntityId | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Empty string for pending invitations. */
  publicKey: string;
  publicPqKey: string | null;
  roleId: EntityId | null;
  /** Built-in role key when system role (`owner` | `admin` | `user`), else null. */
  roleBuiltinKey: string | null;
  roleName: string | null;
  status: WorkspaceMemberStatus;
  invitationId: EntityId | null;
  invitedAt: string | null;
  invitedBy: WorkspaceMemberActorRefDto | null;
  roleChangedAt: string | null;
  roleChangedBy: WorkspaceMemberActorRefDto | null;
  joinedAt: string | null;
  lastLoginAt: string | null;
}

export type WorkspaceMembersPermissionCellDto = {
  get: 0 | 1 | 2;
  post: 0 | 1;
  put: 0 | 1 | 2;
  delete: 0 | 1 | 2;
};

/** `GET /workspaces/:workspaceId/members` success body. */
export interface WorkspaceMembersListResponseDto {
  workspaceId: EntityId;
  members: WorkspaceMemberDto[];
  actorPermissions: {
    members: WorkspaceMembersPermissionCellDto;
  };
}

/** Public display row for activity labels (any workspace member may read). */
export interface WorkspaceMemberDirectoryEntryDto {
  userId: EntityId;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** `GET /workspaces/:workspaceId/member-directory` success body. */
export interface WorkspaceMemberDirectoryResponseDto {
  workspaceId: EntityId;
  members: WorkspaceMemberDirectoryEntryDto[];
}

/** Permission cell shared by role matrix and actor permissions APIs. */
export type WorkspacePermissionScopeLevel = 0 | 1 | 2;
export type WorkspacePermissionPostLevel = 0 | 1;

export type WorkspacePermissionResourceId =
  | "settings"
  | "settings_items"
  | "settings_capsules"
  | "roles"
  | "profiles"
  | "members"
  | "vaults"
  | "billing";

export type WorkspaceResourcePermissionDto = {
  get: WorkspacePermissionScopeLevel;
  post: WorkspacePermissionPostLevel;
  put: WorkspacePermissionScopeLevel;
  delete: WorkspacePermissionScopeLevel;
};

export type WorkspacePermissionsMatrixDto = Record<
  WorkspacePermissionResourceId,
  WorkspaceResourcePermissionDto
>;

/** `GET /workspaces/:workspaceId/me/permissions` success body. */
export interface WorkspaceMePermissionsResponseDto {
  workspaceId: EntityId;
  permissions: WorkspacePermissionsMatrixDto;
}

export function permissionAllowsGet(level: WorkspacePermissionScopeLevel): boolean {
  return level >= 1;
}

export function permissionAllowsPost(level: WorkspacePermissionPostLevel): boolean {
  return level >= 1;
}

export function permissionAllowsAll(level: WorkspacePermissionScopeLevel): boolean {
  return level === 1;
}

export function permissionAllowsMutate(level: WorkspacePermissionScopeLevel): boolean {
  return level >= 1;
}

export function permissionAllowsObject(
  level: WorkspacePermissionScopeLevel,
  isOwn: boolean,
): boolean {
  if (level === 1) {
    return true;
  }
  if (level === 2) {
    return isOwn;
  }
  return false;
}

export const WORKSPACE_PERMISSION_RESOURCE_IDS: readonly WorkspacePermissionResourceId[] = [
  "settings",
  "settings_items",
  "settings_capsules",
  "roles",
  "profiles",
  "members",
  "vaults",
  "billing",
] as const;

const EMPTY_PERMISSION_CELL: WorkspaceResourcePermissionDto = {
  get: 0,
  post: 0,
  put: 0,
  delete: 0,
};

function inheritSettingsNestedCell(
  settings: WorkspaceResourcePermissionDto,
): WorkspaceResourcePermissionDto {
  return {
    get: settings.get >= 1 ? 1 : 0,
    post: 0,
    put: settings.put >= 1 ? 1 : 0,
    delete: 0,
  };
}

/**
 * Fills missing permission resources. Legacy matrices without
 * `settings_items` / `settings_capsules` inherit those cells from `settings`.
 */
export function normalizeWorkspacePermissionsMatrix(
  input: Partial<WorkspacePermissionsMatrixDto> | WorkspacePermissionsMatrixDto | null | undefined,
): WorkspacePermissionsMatrixDto {
  const normalized = {
    settings: { ...EMPTY_PERMISSION_CELL },
    settings_items: { ...EMPTY_PERMISSION_CELL },
    settings_capsules: { ...EMPTY_PERMISSION_CELL },
    roles: { ...EMPTY_PERMISSION_CELL },
    profiles: { ...EMPTY_PERMISSION_CELL },
    members: { ...EMPTY_PERMISSION_CELL },
    vaults: { ...EMPTY_PERMISSION_CELL },
    billing: { ...EMPTY_PERMISSION_CELL },
  } satisfies WorkspacePermissionsMatrixDto;

  if (!input || typeof input !== "object") {
    return normalized;
  }

  for (const resource of WORKSPACE_PERMISSION_RESOURCE_IDS) {
    const cell = input[resource];
    if (!cell || typeof cell !== "object") {
      continue;
    }
    normalized[resource] = {
      get: cell.get,
      post: cell.post,
      put: cell.put,
      delete: cell.delete,
    };
  }

  if (!input.settings_items) {
    normalized.settings_items = inheritSettingsNestedCell(normalized.settings);
  }
  if (!input.settings_capsules) {
    normalized.settings_capsules = inheritSettingsNestedCell(normalized.settings);
  }

  return normalized;
}

/** `GET /invitations/:token` success body (public). */
export interface InvitationPreviewDto {
  status: "pending" | "expired" | "revoked" | "accepted";
  email: string;
  workspaceName: string;
  inviterDisplayName: string;
  expiresAt: string;
}

/** `POST /invitations/:token/accept` success body. */
export interface InvitationAcceptResponseDto {
  workspaceId: EntityId;
  vaultId: EntityId;
}

/** One staged shared-vault grant waiting for a hybrid VaultKey wrap. */
export interface PendingVaultWrapDto {
  userId: EntityId;
  vaultId: EntityId;
  profileId: EntityId;
  publicKey: string;
  publicPqKey: string | null;
}

/**
 * Staged grant that cannot be wrapped because the recipient public key is invalid.
 * Returned so the client can notify the admin (wraps list omits these rows).
 */
export interface PendingVaultWrapSkippedDto {
  userId: EntityId;
  vaultId: EntityId;
  profileId: EntityId;
}

/** `GET /workspaces/:workspaceId/pending-vault-wraps` success body. */
export interface PendingVaultWrapsResponseDto {
  workspaceId: EntityId;
  wraps: PendingVaultWrapDto[];
  /** Recipients skipped server-side due to invalid Ed25519 / ML-KEM public keys. */
  skippedInvalidKeyRecipients: PendingVaultWrapSkippedDto[];
}

/** `POST /workspaces/:workspaceId/invitations` body. */
export interface WorkspaceInvitationsCreateRequestDto {
  invitations: Array<{
    email: string;
    roleId: EntityId;
  }>;
}

/** `POST /workspaces/:workspaceId/invitations` success body. */
export interface WorkspaceInvitationsCreateResponseDto {
  workspaceId: EntityId;
  created: Array<{
    invitationId: EntityId;
    email: string;
    roleId: EntityId;
  }>;
}

/** `PATCH /workspaces/:workspaceId/members/:userId` body. */
export interface WorkspaceMemberUpdateRequestDto {
  roleId: EntityId;
}

/** `PATCH /workspaces/:workspaceId/invitations/:invitationId` body. */
export interface WorkspaceInvitationUpdateRequestDto {
  roleId: EntityId;
}

/** One shared vault access row for a workspace member. */
export interface MemberVaultAccessEntryDto {
  vaultId: EntityId;
  name: string;
  icon: string;
  description: string;
  profileId: EntityId | null;
}

/** `GET /workspaces/:workspaceId/members/:userId/vault-access` success body. */
export interface MemberVaultAccessResponseDto {
  workspaceId: EntityId;
  userId: EntityId;
  vaults: MemberVaultAccessEntryDto[];
}

/** `GET /workspaces/:workspaceId/invitations/:invitationId/vault-access` success body. */
export interface InvitationVaultAccessResponseDto {
  workspaceId: EntityId;
  invitationId: EntityId;
  vaults: MemberVaultAccessEntryDto[];
}

/** `PUT /workspaces/:workspaceId/invitations/:invitationId/vault-access` body. */
export interface InvitationVaultAccessUpdateRequestDto {
  changes: Array<{
    vaultId: EntityId;
    profileId: EntityId | null;
  }>;
}

/**
 * `PUT /workspaces/:workspaceId/members/:userId/vault-access` —
 * apply access changes across shared vaults for one member.
 */
export interface MemberVaultAccessUpdateRequestDto {
  changes: Array<{
    vaultId: EntityId;
    /** Null revokes access; non-null sets/grants profile. */
    profileId: EntityId | null;
    /** Required when granting access to a vault the member did not have. */
    encryptedVaultKey?: EncryptedBlobDto;
    /** Required when revoking: re-wrapped keys for remaining recipients on that vault. */
    rotatedVaultKeys?: VaultRotatedKeyDto[];
    encryptedPayload?: EncryptedBlobDto;
    signature?: HybridSignatureEnvelopeDto;
    baseVersion?: number;
    idempotencyKey?: string;
    clientCreatedAt?: string;
  }>;
}

/** Access assignment for one workspace member on a vault. */
export interface VaultAccessMemberDto {
  userId: EntityId;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  profileId: EntityId | null;
  publicKey: string;
  publicPqKey: string | null;
}

/** Staged access for a pending workspace invitation on a vault. */
export interface VaultAccessInvitationDto {
  invitationId: EntityId;
  email: string;
  role: string | null;
  profileId: EntityId | null;
}

/** `GET /vaults/:vaultId/access` success body. */
export interface VaultAccessResponseDto {
  vaultId: EntityId;
  members: VaultAccessMemberDto[];
  invitations: VaultAccessInvitationDto[];
  /** Current vault event-log head (`MAX(events.version)`). Used as `baseVersion` for revokes. */
  latestVersion?: number;
}

/**
 * `PUT /vaults/:vaultId/access` — batch apply access changes on Save.
 * Grants require `encryptedVaultKey`. Revokes require full `rotatedVaultKeys` for remaining recipients.
 */
export interface VaultAccessUpdateRequestDto {
  grants: Array<{
    userId: EntityId;
    profileId: EntityId;
    encryptedVaultKey: EncryptedBlobDto;
    role?: string;
  }>;
  /** Profile-only updates for users who already have a vault key wrap. */
  profileUpdates: Array<{
    userId: EntityId;
    profileId: EntityId;
  }>;
  revokes: Array<{
    userId: EntityId;
  }>;
  /**
   * Staged profile assignments for pending invitations (no crypto wraps).
   * `profileId: null` clears the staged assignment.
   */
  invitationUpdates?: Array<{
    invitationId: EntityId;
    profileId: EntityId | null;
  }>;
  /** Required when `revokes` is non-empty: re-wrapped keys for all remaining active recipients. */
  rotatedVaultKeys?: VaultRotatedKeyDto[];
  /** Required when revoking; optional for profile/invitation-only updates. */
  encryptedPayload?: EncryptedBlobDto;
  signature?: HybridSignatureEnvelopeDto;
  baseVersion: number;
  idempotencyKey?: string;
  clientCreatedAt?: string;
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
export type {
  FieldValueV2,
  FieldValueTotp,
  ItemFieldV2,
  ItemSectionV2,
  TotpAlgorithm,
  UrlAutofillScope,
} from "./item-schema/types.js";
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
  parseUrlAutofillScope,
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
export type {
  WorkspaceBuiltInRoleDto,
  WorkspaceBuiltInRoleId,
  WorkspaceBuiltInRolesListResponseDto,
  WorkspaceCustomRoleRemnantDto,
  WorkspaceRoleListItemDto,
  WorkspaceRolesListResponseDto,
  WorkspaceRoleSummary,
} from "./workspace-roles.js";
export type {
  ProfileCategoriesPermissionRule,
  ProfileDatetimeMode,
  ProfileDatetimePermissionRule,
  ProfileEntriesResourcePermissions,
  ProfileFieldsPermissionRule,
  ProfileFixedRuleKind,
  ProfileFunctionActionId,
  ProfileFunctionsPermissionRule,
  ProfilePermissionRule,
  ProfilePermissionScope,
  ProfilePermissions,
  ProfilePermitsContext,
  ProfileResourcePostPermission,
  ProfileResourceScopePermission,
  ProfileScopeRuleKind,
  MeVaultProfileEntryDto,
  MeVaultProfilesResponseDto,
  WorkspaceBuiltInProfileDto,
  WorkspaceBuiltInProfileId,
  WorkspaceBuiltInProfilesListResponseDto,
  WorkspaceCustomProfileRemnantDto,
  WorkspaceProfileListItemDto,
  WorkspaceProfilesListResponseDto,
  WorkspaceProfileSummary,
} from "./workspace-profiles.js";
export {
  PROFILE_DATETIME_MODES,
  PROFILE_FIXED_RULE_KINDS,
  PROFILE_FUNCTION_ACTION_IDS,
  PROFILE_PERMISSION_SCOPES,
  PROFILE_RESOURCE_PERMISSION_ALL,
  PROFILE_RESOURCE_PERMISSION_NONE,
  PROFILE_RESOURCE_PERMISSION_OWN,
  PROFILE_SCOPE_RULE_KINDS,
  createEmptyProfilePermissions,
  createFullAccessProfilePermissions,
  createSimpleProfilePermissions,
  ensureProfilePermissions,
  getBuiltInProfilePermissions,
  getProfileEntries,
  profileAllowsCategory,
  profileAllowsDatetime,
  profileAllowsEntriesArchive,
  profileAllowsEntriesDelete,
  profileAllowsEntriesGet,
  profileAllowsEntriesPost,
  profileAllowsEntriesPut,
  profileAllowsFieldType,
  profileAllowsFunction,
  profileAllowsItemView,
} from "./workspace-profiles.js";

/** @deprecated Use {@link CoreApiErrorBody}; the wire field is `error`, not `code`. */
export type ApiError = CoreApiErrorBody;

/** `POST /auth/email/start` and `POST /auth/email/resend` success body. */
export interface EmailAuthStartResponse {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  /**
   * When true (self-hosted empty catalog with exclusive claim), skip OTP and open
   * registration with `authStateId`. Omitted on saas, after any user exists, or when
   * another first-run claim is already held (normal email OTP).
   */
  bootstrapRequired?: boolean;
  authStateId?: string;
  nextStep?: "registration";
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

/** `POST /auth/extension/code` — short-lived PKCE auth code for browser extension session handoff. */
export interface ExtensionAuthCodeIssueRequestDto {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method?: "S256";
}

export interface ExtensionAuthCodeIssueResponseDto {
  code: string;
  expires_at: string;
  expires_in: number;
}

/** `POST /auth/extension/token` — exchange auth_code + PKCE verifier for Bearer session. */
export interface ExtensionAuthTokenRequestDto {
  client_id: string;
  redirect_uri: string;
  code: string;
  code_verifier: string;
}

/** `GET /auth/two-factor/status` success body. */
export interface TwoFactorStatusResponseDto {
  enabled: boolean;
  backupCodesRemaining: number;
  /** ISO-8601 timestamp of the latest backup-code batch, or null if none. */
  backupCodesGeneratedAt: string | null;
  /**
   * ISO-8601 timestamp of the latest backup-codes copy/PDF download ack,
   * or null if never exported (factor B for account security score).
   */
  backupCodesExportedAt: string | null;
}

/** Account-level recovery entitlements (always includes recovery key). */
export interface AccountRecoveryEntitlementsDto {
  recoveryKey: true;
  trustedDevices: boolean;
  trustedContacts: boolean;
}

export interface AccountRecoveryKeyMetaDto {
  enrolled: boolean;
  createdAt: string | null;
  rotatedAt: string | null;
  /** When the user last copied or downloaded the key (null = never). */
  exportedAt: string | null;
}

export interface AccountRecoverySettingsDto {
  keyEnabled: boolean;
  devicesEnabled: boolean;
  contactsEnabled: boolean;
}

export type TrustedContactStatusDto = "pending" | "confirmed";

export interface TrustedContactDto {
  id: EntityId;
  email: string;
  /** Linked Okkey user id when the invite was accepted (confirmed contacts). */
  contactUserId?: EntityId | null;
  status: TrustedContactStatusDto;
  createdAt: string;
  confirmedAt: string | null;
}

export interface TrustedContactInviteDto {
  id: EntityId;
  ownerEmail: string;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  createdAt: string;
}

/**
 * Accounts where the current user is a confirmed trusted contact
 * (other owners listed you for recovery help).
 */
export interface TrustedContactMembershipDto {
  id: EntityId;
  ownerEmail: string;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

/** `GET /account/recovery` aggregate status. */
export interface AccountRecoveryStatusResponseDto {
  entitlements: AccountRecoveryEntitlementsDto;
  settings: AccountRecoverySettingsDto;
  key: AccountRecoveryKeyMetaDto;
  contacts: TrustedContactDto[];
  confirmedContactCount: number;
  minConfirmedContacts: number;
  pendingInvites: TrustedContactInviteDto[];
  /** Confirmed rows where the current user is someone else's trusted contact. */
  servingAsContact: TrustedContactMembershipDto[];
}

/** `PATCH /account/recovery/settings` request. */
export interface AccountRecoverySettingsUpdateRequestDto {
  keyEnabled?: boolean;
  devicesEnabled?: boolean;
  contactsEnabled?: boolean;
}

/** `POST /account/recovery/key/enroll` and rotate request. */
export interface AccountRecoveryKeyEnrollRequestDto {
  encryptedBlob: EncryptedBlobDto;
}

export interface AccountRecoveryKeyEnrollResponseDto {
  key: AccountRecoveryKeyMetaDto;
  settings: AccountRecoverySettingsDto;
}

/** `GET /account/recovery/key/wrap` — client unwraps locally with the recovery secret. */
export interface AccountRecoveryKeyWrapResponseDto {
  encryptedBlob: EncryptedBlobDto;
}

/**
 * Invite trusted contact(s). Accepts the single-email DTO or an invite-members-style
 * batch (`invitations` / `emails`) so the multi-row recovery form stays aligned.
 */
export interface TrustedContactInviteRequestDto {
  email?: string;
  emails?: string[];
  invitations?: Array<{ email?: string }>;
  /**
   * Inviter UI locale (same pattern as auth email codes).
   * Used when the recipient has no saved `users.locale`.
   */
  locale?: string;
}

export interface TrustedContactInviteResponseDto {
  /** First invited contact (single-email clients). */
  contact: TrustedContactDto;
  /** All contacts created in this request (batch / multi-row). */
  contacts: TrustedContactDto[];
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

/** First-factor login method identifiers. */
export type PrimaryLoginMethod = "email" | "passkey" | "hardware_key";

export type WebAuthnAuthenticatorAttachment = "platform" | "cross-platform";

/** Public credential row in login-methods settings. */
export interface WebAuthnCredentialPublicDto {
  id: EntityId;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

/** `GET /account/login-methods` and mutating login-method responses. */
export interface AccountLoginMethodsResponseDto {
  primary: PrimaryLoginMethod;
  email: string;
  passkeys: WebAuthnCredentialPublicDto[];
  hardware_keys: WebAuthnCredentialPublicDto[];
}

/** `PATCH /account/login-methods/primary` request. */
export interface AccountLoginMethodsPrimaryPatchDto {
  primary: PrimaryLoginMethod;
}

/** `POST /account/webauthn/register/options` request. */
export interface WebAuthnRegisterOptionsRequestDto {
  attachment: WebAuthnAuthenticatorAttachment;
}

/** `POST /account/webauthn/register/options` and login options success. */
export interface WebAuthnCeremonyOptionsResponseDto {
  challengeId: string;
  options: Record<string, unknown>;
}

/** `POST /account/webauthn/register/verify` request. */
export interface WebAuthnRegisterVerifyRequestDto {
  challengeId: string;
  response: Record<string, unknown>;
  name?: string;
}

/** `POST /auth/login/discover` request. */
export interface AuthLoginDiscoverRequestDto {
  email: string;
}

/** `POST /auth/login/discover` success. */
export interface AuthLoginDiscoverResponseDto {
  primary: PrimaryLoginMethod;
  methods: PrimaryLoginMethod[];
}

/** `POST /auth/webauthn/login/options` request. */
export interface WebAuthnLoginOptionsRequestDto {
  email?: string;
  attachment?: WebAuthnAuthenticatorAttachment;
}

/** `POST /auth/webauthn/login/verify` request. */
export interface WebAuthnLoginVerifyRequestDto {
  challengeId: string;
  response: Record<string, unknown>;
}

/** `POST /auth/webauthn/login/verify` success (same shape as email confirm for existing users). */
export interface WebAuthnLoginVerifyResponseDto {
  authStateId: string;
  userExists: true;
  nextStep: "device_check" | "two_factor";
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
  /**
   * Server-side item id for ITEM_* events (retention + client integrity checks).
   * Clients must ignore ITEM_* events whose decrypted plaintext.itemId differs.
   */
  referencedItemId?: EntityId | null;
  /**
   * Server-persisted soft-delete hint for ITEM_* events.
   * Clients must apply plaintext `deleted` on ITEM_UPDATE only when this is true
   * (or when unset on legacy events). `false` means the update is not a soft-delete.
   */
  itemSoftDeleted?: boolean | null;
  version: number;
  createdAt: string;
}

/** `GET /vaults/:vaultId/events` success body. */
export interface SyncEventsListResponseDto {
  vaultId: EntityId;
  afterVersion: number;
  events: SyncEventWireDto[];
  /** Highest version in this response, or `afterVersion` when `events` is empty. */
  latestVersion: number;
  /**
   * When false, this page is the full remainder after `afterVersion`.
   * Clients must not issue another GET just to observe an empty page.
   */
  hasMore: boolean;
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
  /** Highest version in this response, or `afterVersion` when `events` is empty. */
  latestVersion: number;
  /**
   * When false, this page is the full remainder after `afterVersion`.
   * Clients must not issue another GET just to observe an empty page.
   */
  hasMore: boolean;
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
  allowed_file_extensions: string[];
  max_file_size_mb: number;
  files_in_items_enabled: boolean;
  capsule_policies: WorkspaceCapsulePoliciesDto;
  monitoring_card_settings: WorkspaceMonitoringCardSettingsDto;
  tile_color: string | null;
  logo_vault_id: string | null;
  logo_attachment_id: string | null;
}

/** `PATCH /workspaces/:workspaceId/settings` request body. */
export interface WorkspaceSettingsUpdateRequestDto {
  name?: string;
  deleted_items_retention_days?: number;
  allowed_file_extensions?: string[];
  max_file_size_mb?: number;
  files_in_items_enabled?: boolean;
  capsule_policies?: Partial<WorkspaceCapsulePoliciesDto>;
  monitoring_card_settings?: Partial<WorkspaceMonitoringCardSettingsDto>;
  tile_color?: string | null;
  logo_vault_id?: string | null;
  logo_attachment_id?: string | null;
}

/** `DELETE /workspaces/:workspaceId/settings` request body. */
export interface WorkspaceDeleteRequestDto {
  confirmation_name: string;
}

/** `POST /workspaces/:workspaceId/plan-change-requests` request body. */
export interface WorkspacePlanChangeRequestDto {
  /** Catalog tier the operator wants to upgrade to (must be above current). */
  requested_plan_tier: PlanTier;
  /** Contact email for sales follow-up (defaults to account email when omitted). */
  contact_email: string;
  /** UI locale (`en` | `ru`); server may also use account locale. */
  locale: string;
  /**
   * Billing region ISO 3166-1 alpha-2 hint from the client (browser detect).
   * Server prefers the account billing region when set.
   */
  region: string | null;
  /**
   * Expected workspace member / seat count from the license request form (integer ≥ 1).
   * Required for self-hosted license purchase requests; SaaS may omit (server counts members).
   */
  workspace_member_count?: number;
}

/** `POST /workspaces/:workspaceId/plan-change-requests` success body. */
export interface WorkspacePlanChangeRequestResponseDto {
  submitted: true;
}

/** `GET /workspaces/:workspaceId/plan-change-requests` status body. */
export interface WorkspacePlanChangeRequestStatusDto {
  submitted: boolean;
  /** ISO timestamp when the request email was sent; null if never submitted. */
  sent_at: string | null;
  /**
   * True when the API can deliver the sales/license request email via a real
   * transport (`smtp` | `ses` | `http-api` with valid config). False for
   * `EMAIL_PROVIDER=logger` or incomplete provider config — clients should
   * open `mailto:` instead of the in-app form.
   */
  sales_email_deliverable: boolean;
  /** Sales inbox for mailto fallback (`OKKEY_SALES_EMAIL`; required server setting, no default). */
  sales_email: string;
}

/** @deprecated Use WorkspaceBuiltInRoleDto */
export type WorkspaceRoleDto = WorkspaceBuiltInRoleDto;

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
   * Hybrid-by-default contract (every `DEPLOY_ENV`) expects:
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

export * from "./capsules.js";
export * from "./workspace-capsule-policies.js";
export * from "./workspace-monitoring-card-settings.js";

/** Optional nested metadata (same semantics as `POST /devices/register`). */
export interface RegisterCompleteMetadataDto {
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  crypto_capable?: boolean;
  /**
   * When true on `POST /devices/register`, if the user has exactly one trusted device,
   * rebind that row to this fingerprint/public key instead of creating a pending device.
   */
  reclaim_sole_trusted?: boolean;
  /**
   * When true on `POST /devices/register` after account recovery: become sole trusted
   * device with the provided device_share and revoke other trusted devices.
   */
  claim_after_recovery?: boolean;
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
  /**
   * UI locale (`en` | `ru`), same pattern as auth email codes.
   * Prefer this over `Accept-Language` — browsers forbid overriding that header from fetch.
   */
  locale?: string;
  metadata?: RegisterCompleteMetadataDto;
}

/** `POST /devices/:deviceId/bind-challenge` success body. */
export interface DeviceBindChallengeResponseDto {
  challenge_id: string;
  /** Base64 of the exact bytes the device private key must sign. */
  challenge: string;
  expires_at: string;
}

/** `POST /devices/:deviceId/bind-session` request body. */
export interface DeviceBindSessionRequestDto {
  challenge_id: string;
  /** Base64 Ed25519 signature of `challenge` by the device private key. */
  signature: string;
  device_name?: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
}

/**
 * `POST /devices/:deviceId/request-key-rebind` — replace lost signing keys and
 * demote the device to pending for approval by another trusted device.
 */
export interface DeviceKeyRebindRequestDto {
  device_public_key: string;
  device_share: string;
  device_fingerprint?: string;
  device_name?: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  locale?: string;
}

/** `POST /devices/register` success body (snake_case on wire). */
export interface DeviceRegisterResponseDto {
  device_id: EntityId;
  status: "trusted" | "pending_approval" | "blocked";
  /** Present when status is `blocked`; null means permanently blocked. */
  blocked_until?: string | null;
}

/** `POST /devices/:deviceId/reject` success body. */
export interface DeviceRejectResponseDto {
  device_id: EntityId;
  status: "revoked";
}

/** Timed / permanent block durations for pending device dismissal. */
export type DeviceBlockDuration = "1h" | "1d" | "1w" | "forever";

/** `POST /devices/:deviceId/block` request body. */
export interface DeviceBlockRequestDto {
  duration: DeviceBlockDuration;
  reason?: string;
}

/** `POST /devices/:deviceId/block` success body. */
export interface DeviceBlockResponseDto {
  device_id: EntityId;
  status: "blocked";
  blocked_until: string | null;
}

/** `POST /devices/:deviceId/unblock` request body. */
export interface DeviceUnblockRequestDto {
  /** When true, device becomes trusted immediately (no new approval request). */
  trust?: boolean;
}

/** `POST /devices/:deviceId/unblock` success body. */
export interface DeviceUnblockResponseDto {
  device_id: EntityId;
  status: "trusted" | "revoked";
}

/** Single device row for `GET /devices` (snake_case on wire). */
export interface DeviceListItemDto {
  device_id: EntityId;
  device_name: string;
  device_fingerprint: string;
  status: "trusted" | "pending_approval" | "blocked";
  platform: string;
  os_name: string;
  os_version: string;
  app_version: string;
  client_type: string;
  user_agent?: string;
  ip_address: string;
  country: string | null;
  city: string | null;
  created_at: string;
  last_seen_at: string | null;
  approved_at: string | null;
  is_current: boolean;
  approval_expires_at: string | null;
  /** Present for blocked devices; null means permanently blocked. */
  blocked_until?: string | null;
}

/** `GET /devices` success body. */
export interface DeviceListResponseDto {
  devices: DeviceListItemDto[];
  pending: DeviceListItemDto[];
  blocked: DeviceListItemDto[];
}

/** `PATCH /devices/:deviceId` request body. */
export interface DevicePatchRequestDto {
  device_name: string;
}

/** `PATCH /devices/:deviceId` success body. */
export interface DevicePatchResponseDto {
  device_id: EntityId;
  device_name: string;
}

/** `POST /devices/:deviceId/revoke` request body. */
export interface DeviceRevokeRequestDto {
  reason?: string;
  /**
   * When true, allows revoking the caller device identified by `X-Device-Id`
   * (sign-out / logout path). Omitted or false rejects that case with 403.
   */
  sign_out?: boolean;
}

/** `POST /devices/:deviceId/revoke` success body. */
export interface DeviceRevokeResponseDto {
  device_id: EntityId;
  status: "revoked";
}

/** `POST /auth/register/complete` request body (snake_case on wire). */
export interface RegisterCompleteRequestDto {
  /** Opaque auth state id from email confirm (CSPRNG hex; not a snowflake entity id). */
  auth_state_id: string;
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
  /** Optional label for the default personal workspace only; server default is `Personal`. */
  personal_workspace_name?: string;
  /**
   * Optional label for the personal vault created at registration.
   * Independent of workspace name; server default is `Personal vault`.
   */
  personal_vault_name?: string;
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
  /**
   * Short-lived bootstrap Bearer for recovery key enroll + export ack only.
   * Present on the first successful completion; omitted on idempotent replay.
   */
  access_token?: string;
  expires_at?: string;
  token_type?: "Bearer";
  /** When `access_token` is present: `registration_recovery`. */
  scope?: "registration_recovery";
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
  /** ISO timestamp of last master-password set/change; null if unknown (legacy). */
  master_password_changed_at: string | null;
}

/** `PATCH /account/profile` (Bearer) — non-sensitive account preferences. */
export interface AccountProfileUpdateRequestDto {
  first_name?: string | null;
  last_name?: string | null;
  locale?: string | null;
  billing_region?: string | null;
  /** Inactivity timeout before vault locks on device (seconds); 60…86400. */
  vault_idle_lock_seconds?: number;
}

/** `POST /account/master-password/change` (Bearer) — opaque split-key rebalance only. */
export interface AccountMasterPasswordChangeRequestDto {
  server_key_share: string;
  password_kdf_salt: string;
  password_kdf_params_version: number;
}

/** `POST /account/master-password/change` success body. */
export interface AccountMasterPasswordChangeResponseDto {
  master_password_changed_at: string;
}

/** Signed proof for `POST /account/vault-unlock` (identity Ed25519). */
export interface VaultUnlockAttestationDto {
  purpose: "account.vault_unlock";
  user_id: string;
  recorded_at: string;
  signature: string;
}

/** `POST /account/vault-unlock` with a signed attestation. */
export interface VaultUnlockRecordRequestDto {
  attestation: VaultUnlockAttestationDto;
}

/** `POST /account/vault-unlock` failure report (no secrets). */
export interface VaultUnlockFailureRequestDto {
  failure: true;
}

/** `POST /account/vault-unlock` success / failure-ack body. */
export interface VaultUnlockRecordResponseDto {
  recorded: boolean;
  locked?: boolean;
  remaining_ms?: number;
}

/** `GET /account/vault-unlock/status` body. */
export interface VaultUnlockAttemptStatusDto {
  locked: boolean;
  remaining_ms: number;
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
  /** When true, skip auto-creating personal_data after unlock (deleted or legacy member). */
  personal_data_bootstrap_dismissed: boolean;
}

/**
 * `PUT /workspaces/:workspaceId/item-category-preferences` (Bearer).
 * Favorites fields update favorites; `personal_data_bootstrap_dismissed` alone is enough to set the flag.
 */
export interface WorkspaceItemCategoryPreferencesUpdateRequestDto {
  favorite_category_ids?: string[];
  favorite_template_ids?: string[];
  favorite_order?: string[];
  personal_data_bootstrap_dismissed?: boolean;
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
