import type { FolderPlaintextV1, SyncEventWireDto } from "@okkey/types";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
  parseFolderPlaintextUtf8,
  parseItemFolderAssignPlaintextUtf8,
} from "@okkey/types";

const FOLDER_ROW_TYPES = new Set(["FOLDER_CREATE", "FOLDER_UPDATE", "FOLDER_DELETE"]);

const FOLDER_AND_ASSIGN_TYPES = new Set([
  ...FOLDER_ROW_TYPES,
  "ITEM_FOLDER_ASSIGN",
]);

function getEventBlob(event: SyncEventWireDto): { crypto_version: number; payload: string } {
  const maybe = event as SyncEventWireDto & {
    encryptedBlob?: { crypto_version?: number; payload?: string };
    payloadSchemaVersion?: number;
    encryptedPayload?: string;
  };
  if (maybe.encryptedBlob?.payload) {
    return {
      crypto_version: maybe.encryptedBlob.crypto_version ?? 2,
      payload: maybe.encryptedBlob.payload,
    };
  }
  return {
    crypto_version: maybe.payloadSchemaVersion ?? 2,
    payload: maybe.encryptedPayload ?? "",
  };
}

export interface FolderVaultReplayState {
  /** Active folders (no tombstones). */
  folders: Map<string, FolderPlaintextV1>;
  /** Item placement in personal tree; `null` = vault root (no folder). */
  itemFolder: Map<string, string | null>;
}

function clearAssignmentsToFolder(
  itemFolder: Map<string, string | null>,
  folderId: string,
): void {
  for (const [itemId, fid] of itemFolder) {
    if (fid === folderId) {
      itemFolder.set(itemId, null);
    }
  }
}

function removeFolder(state: FolderVaultReplayState, folderId: string): void {
  state.folders.delete(folderId);
  clearAssignmentsToFolder(state.itemFolder, folderId);
}

/**
 * Deterministic replay of personal folder metadata for one user on a vault stream.
 * Only events whose `actorId` equals `currentUserId` are applied (other users' ciphertext
 * is skipped without decrypting). Decrypt failures are skipped (corrupt or wrong key).
 */
export async function replayFolderAndAssignEvents(
  events: SyncEventWireDto[],
  vaultId: string,
  currentUserId: string,
  decryptWirePayload: (encryptedPayloadBase64: string) => Promise<Uint8Array>,
): Promise<FolderVaultReplayState> {
  const folders = new Map<string, FolderPlaintextV1>();
  const itemFolder = new Map<string, string | null>();
  const state: FolderVaultReplayState = { folders, itemFolder };

  for (const ev of events) {
    if (!FOLDER_AND_ASSIGN_TYPES.has(ev.eventType)) {
      continue;
    }
    if (ev.actorId !== currentUserId) {
      continue;
    }

    let plaintextBytes: Uint8Array;
    try {
      plaintextBytes = await decryptWirePayload(getEventBlob(ev).payload);
    } catch {
      continue;
    }

    if (ev.eventType === "ITEM_FOLDER_ASSIGN") {
      if (getEventBlob(ev).crypto_version !== ITEM_FOLDER_ASSIGN_SCHEMA_VERSION) {
        continue;
      }
      const assign = parseItemFolderAssignPlaintextUtf8(plaintextBytes);
      if (!assign || assign.vaultId !== vaultId) {
        continue;
      }
      itemFolder.set(assign.itemId, assign.folderId);
      continue;
    }

    if (getEventBlob(ev).crypto_version !== FOLDER_PLAINTEXT_SCHEMA_VERSION) {
      continue;
    }

    const row = parseFolderPlaintextUtf8(plaintextBytes);
    if (!row || row.vaultId !== vaultId) {
      continue;
    }

    switch (ev.eventType) {
      case "FOLDER_CREATE":
      case "FOLDER_UPDATE": {
        if (row.deleted) {
          removeFolder(state, row.folderId);
        } else {
          folders.set(row.folderId, row);
        }
        break;
      }
      case "FOLDER_DELETE": {
        removeFolder(state, row.folderId);
        break;
      }
      default:
        break;
    }
  }

  return state;
}
