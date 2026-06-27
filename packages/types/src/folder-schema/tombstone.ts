import type { EntityId } from "../entity-id.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
  type FolderPlaintextV1,
  type FolderPlaintextV2,
} from "./types.js";

export function createFolderDeleteTombstoneV1(
  folderId: EntityId,
  vaultId: EntityId,
  updatedAtMs: number,
): FolderPlaintextV1 {
  return {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId,
    vaultId,
    name: "",
    parentFolderId: null,
    createdAtMs: 0,
    updatedAtMs,
    deleted: true,
  };
}

export function createFolderDeleteTombstoneV2(
  folderId: EntityId,
  workspaceId: EntityId,
  updatedAtMs: number,
): FolderPlaintextV2 {
  return {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId,
    workspaceId,
    name: "",
    parentFolderId: null,
    createdAtMs: 0,
    updatedAtMs,
    deleted: true,
  };
}
