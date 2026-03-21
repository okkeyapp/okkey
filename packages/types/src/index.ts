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

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
