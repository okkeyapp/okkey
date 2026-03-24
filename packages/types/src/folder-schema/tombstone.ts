import type { UUID } from "../uuid.js";
import { FOLDER_PLAINTEXT_SCHEMA_VERSION, type FolderPlaintextV1 } from "./types.js";

export function createFolderDeleteTombstoneV1(
  folderId: UUID,
  vaultId: UUID,
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
