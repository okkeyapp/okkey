export type UUID = string;

export interface User {
  id: UUID;
  email: string;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: UUID;
  name: string;
  ownerId: UUID;
  planTier: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vault {
  id: UUID;
  workspaceId: UUID;
  name: string;
  isPersonal: boolean;
  ownerId?: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: UUID;
  vaultId: UUID;
  encryptedData: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: UUID;
  userId: UUID;
  deviceName: string;
  devicePublicKey: string;
  createdAt: string;
  lastSeenAt?: string | null;
}

export interface Session {
  id: UUID;
  userId: UUID;
  deviceId?: UUID | null;
  expiresAt: string;
  createdAt: string;
}

export const EVENT_TYPES = [
  "ITEM_CREATE",
  "ITEM_UPDATE",
  "ITEM_DELETE",
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
  userId: UUID;
  deviceId?: UUID | null;
}

export interface SyncEvent {
  id: UUID;
  workspaceId: UUID;
  vaultId: UUID;
  eventType: EventType;
  actor: EventActor;
  payloadCiphertext: string;
  payloadEncoding: EventPayloadEncoding;
  payloadSchemaVersion: number;
  idempotencyKey: UUID;
  baseVersion: number;
  version: number;
  createdAt: string;
  clientCreatedAt?: string | null;
}

export type EventLogEntry = SyncEvent;

export interface FetchEventsQuery {
  vaultId: UUID;
  afterVersion: number;
  limit?: number;
}

export interface FetchEventsResult {
  vaultId: UUID;
  events: SyncEvent[];
  latestVersion: number;
  hasMore: boolean;
}

export interface AppendEventRequest {
  vaultId: UUID;
  eventType: EventType;
  payloadCiphertext: string;
  payloadEncoding: EventPayloadEncoding;
  payloadSchemaVersion: number;
  idempotencyKey: UUID;
  baseVersion: number;
  clientCreatedAt?: string | null;
}

export interface AppendEventResult {
  event: SyncEvent;
  latestVersion: number;
}

export interface SyncConflictErrorDetails {
  code: SyncConflictCode;
  vaultId: UUID;
  expectedBaseVersion: number;
  latestVersion: number;
}

/** JSON body returned by Core API on non-2xx responses (`services/api`). */
export interface CoreApiErrorBody {
  error: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
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
  user_id: UUID;
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
  id: UUID;
  vaultId: UUID;
  actorId: UUID | null;
  eventType: string;
  encryptedPayload: string;
  version: number;
  createdAt: string;
}

/** `GET /vaults/:vaultId/events` success body. */
export interface SyncEventsListResponseDto {
  vaultId: UUID;
  afterVersion: number;
  events: SyncEventWireDto[];
}

/** `POST /vaults/:vaultId/events` request body. */
export interface SyncAppendEventRequestDto {
  eventType: string;
  encryptedPayload: string;
  baseVersion: number;
}

/** Optional nested metadata (same semantics as `POST /devices/register`). */
export interface RegisterCompleteMetadataDto {
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
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
  device_id: UUID;
  status: "trusted" | "pending_approval";
}

/** `POST /devices/:deviceId/reject` success body. */
export interface DeviceRejectResponseDto {
  device_id: UUID;
  status: "revoked";
}

/** `POST /auth/register/complete` request body (snake_case on wire). */
export interface RegisterCompleteRequestDto {
  auth_state_id: UUID;
  user_public_key: string;
  encrypted_private_key: string;
  server_key_share: string;
  password_kdf_salt: string;
  password_kdf_params_version: number;
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

/** `POST /auth/register/complete` success body (snake_case on wire). */
export interface RegisterCompleteResponseDto {
  user_id: UUID;
  workspace_id: UUID;
  vault_id: UUID;
  device_id: UUID;
  device_status: "trusted";
}
