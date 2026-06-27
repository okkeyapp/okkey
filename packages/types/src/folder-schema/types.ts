import type { EntityId } from "../entity-id.js";

/** Encrypted JSON inside FOLDER_* event ciphertext (legacy vault-scoped). */
export const FOLDER_PLAINTEXT_SCHEMA_VERSION = 1 as const;

/** Encrypted JSON inside FOLDER_* event ciphertext (workspace-scoped). */
export const FOLDER_PLAINTEXT_SCHEMA_VERSION_V2 = 2 as const;

/** Encrypted JSON inside ITEM_FOLDER_ASSIGN ciphertext (legacy vault-scoped). */
export const ITEM_FOLDER_ASSIGN_SCHEMA_VERSION = 1 as const;

/** Encrypted JSON inside ITEM_FOLDER_ASSIGN ciphertext (workspace-scoped). */
export const ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2 = 2 as const;

export interface FolderPlaintextV1 {
  schemaVersion: typeof FOLDER_PLAINTEXT_SCHEMA_VERSION;
  folderId: EntityId;
  vaultId: EntityId;
  name: string;
  parentFolderId: EntityId | null;
  createdAtMs: number;
  updatedAtMs: number;
  /** Tombstone for FOLDER_DELETE / FOLDER_UPDATE delete. */
  deleted?: boolean;
}

export interface ItemFolderAssignPlaintextV1 {
  schemaVersion: typeof ITEM_FOLDER_ASSIGN_SCHEMA_VERSION;
  itemId: EntityId;
  vaultId: EntityId;
  /** `null` = not in any folder (vault root). */
  folderId: EntityId | null;
}

export interface FolderPlaintextV2 {
  schemaVersion: typeof FOLDER_PLAINTEXT_SCHEMA_VERSION_V2;
  folderId: EntityId;
  workspaceId: EntityId;
  name: string;
  parentFolderId: EntityId | null;
  createdAtMs: number;
  updatedAtMs: number;
  /** Sibling order under `parentFolderId` (0-based). */
  sortOrder?: number;
  /** Tombstone for FOLDER_DELETE / FOLDER_UPDATE delete. */
  deleted?: boolean;
}

export interface ItemFolderAssignPlaintextV2 {
  schemaVersion: typeof ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2;
  itemId: EntityId;
  workspaceId: EntityId;
  /** `null` = not in any folder. */
  folderId: EntityId | null;
}
