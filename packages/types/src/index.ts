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

export type EventType =
  | "ITEM_CREATE"
  | "ITEM_UPDATE"
  | "ITEM_DELETE"
  | "VAULT_CREATE"
  | "VAULT_SHARE"
  | "VAULT_KEY_ROTATION"
  | "DEVICE_ADD"
  | "DEVICE_REMOVE";

export interface EventLogEntry {
  id: UUID;
  vaultId: UUID;
  actorId?: UUID | null;
  eventType: EventType;
  encryptedPayload: string;
  version: number;
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
}
