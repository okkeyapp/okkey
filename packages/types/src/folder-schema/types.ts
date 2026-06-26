import type { EntityId } from "../entity-id.js";

/** Encrypted JSON inside FOLDER_* event ciphertext. */
export const FOLDER_PLAINTEXT_SCHEMA_VERSION = 1 as const;

/** Encrypted JSON inside ITEM_FOLDER_ASSIGN ciphertext. */
export const ITEM_FOLDER_ASSIGN_SCHEMA_VERSION = 1 as const;

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
