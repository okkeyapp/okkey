import type { FolderPlaintextV2, WorkspacePersonalEventWireDto } from "@okkey/types";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
  ITEM_FAVORITE_SET_SCHEMA_VERSION_V2,
  parseFolderPlaintextV2Utf8,
  parseItemFolderAssignPlaintextV2Utf8,
  parseItemFavoriteSetPlaintextV2Utf8,
} from "@okkey/types";

const FOLDER_ROW_TYPES = new Set(["FOLDER_CREATE", "FOLDER_UPDATE", "FOLDER_DELETE"]);

const FOLDER_AND_ASSIGN_TYPES = new Set([
  ...FOLDER_ROW_TYPES,
  "ITEM_FOLDER_ASSIGN",
  "ITEM_FAVORITE_SET",
]);

const SUPPORTED_FOLDER_METADATA_ENVELOPE_VERSIONS = new Set<number>([
  FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
  2,
]);

const SUPPORTED_ITEM_FOLDER_ASSIGN_ENVELOPE_VERSIONS = new Set<number>([
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
  2,
]);

const SUPPORTED_ITEM_FAVORITE_SET_ENVELOPE_VERSIONS = new Set<number>([
  ITEM_FAVORITE_SET_SCHEMA_VERSION_V2,
  2,
]);

function getEventBlob(event: WorkspacePersonalEventWireDto): { crypto_version: number; payload: string } {
  return {
    crypto_version: event.encryptedBlob.crypto_version ?? 2,
    payload: event.encryptedBlob.payload,
  };
}

export interface WorkspaceFolderReplayState {
  folders: Map<string, FolderPlaintextV2>;
  itemFolder: Map<string, string | null>;
  itemFavorite: Set<string>;
  lastAppliedVersion: number;
}

export type WorkspaceFolderTreeNode = {
  id: string;
  label: string;
  children?: WorkspaceFolderTreeNode[];
};

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

function removeFolder(state: WorkspaceFolderReplayState, folderId: string): void {
  state.folders.delete(folderId);
  clearAssignmentsToFolder(state.itemFolder, folderId);
}

function sortEvents(events: WorkspacePersonalEventWireDto[]): WorkspacePersonalEventWireDto[] {
  return [...events].sort((a, b) => {
    if (a.version !== b.version) return a.version - b.version;
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Deterministic replay of workspace personal folder metadata for one user stream.
 *
 * Undecryptable / unparseable events still advance `lastAppliedVersion`. Otherwise a
 * later success (or page-cursor pagination) can permanently skip a decryptable
 * FOLDER_DELETE that sat in a failed gap — zombie folders on every client.
 */
export async function replayWorkspaceFolderEvents(
  events: WorkspacePersonalEventWireDto[],
  workspaceId: string,
  decryptWirePayload: (encryptedPayloadBase64: string) => Promise<Uint8Array>,
  initialLastAppliedVersion = 0,
  initialState?: Pick<WorkspaceFolderReplayState, "folders" | "itemFolder" | "itemFavorite">,
): Promise<WorkspaceFolderReplayState> {
  const state: WorkspaceFolderReplayState = {
    folders: new Map(initialState?.folders),
    itemFolder: new Map(initialState?.itemFolder),
    itemFavorite: new Set(initialState?.itemFavorite),
    lastAppliedVersion: initialLastAppliedVersion,
  };

  for (const ev of sortEvents(events)) {
    if (ev.workspaceId !== workspaceId) {
      continue;
    }
    if (ev.version <= state.lastAppliedVersion) {
      continue;
    }

    if (!FOLDER_AND_ASSIGN_TYPES.has(ev.eventType)) {
      state.lastAppliedVersion = ev.version;
      continue;
    }

    let plaintextBytes: Uint8Array;
    try {
      plaintextBytes = await decryptWirePayload(getEventBlob(ev).payload);
    } catch {
      state.lastAppliedVersion = ev.version;
      continue;
    }

    if (ev.eventType === "ITEM_FOLDER_ASSIGN") {
      if (!SUPPORTED_ITEM_FOLDER_ASSIGN_ENVELOPE_VERSIONS.has(getEventBlob(ev).crypto_version)) {
        state.lastAppliedVersion = ev.version;
        continue;
      }
      const assign = parseItemFolderAssignPlaintextV2Utf8(plaintextBytes);
      if (!assign || assign.workspaceId !== workspaceId) {
        state.lastAppliedVersion = ev.version;
        continue;
      }
      state.itemFolder.set(assign.itemId, assign.folderId);
      state.lastAppliedVersion = ev.version;
      continue;
    }

    if (ev.eventType === "ITEM_FAVORITE_SET") {
      if (!SUPPORTED_ITEM_FAVORITE_SET_ENVELOPE_VERSIONS.has(getEventBlob(ev).crypto_version)) {
        state.lastAppliedVersion = ev.version;
        continue;
      }
      const favoriteSet = parseItemFavoriteSetPlaintextV2Utf8(plaintextBytes);
      if (!favoriteSet || favoriteSet.workspaceId !== workspaceId) {
        state.lastAppliedVersion = ev.version;
        continue;
      }
      if (favoriteSet.favorite) {
        state.itemFavorite.add(favoriteSet.itemId);
      } else {
        state.itemFavorite.delete(favoriteSet.itemId);
      }
      state.lastAppliedVersion = ev.version;
      continue;
    }

    if (!SUPPORTED_FOLDER_METADATA_ENVELOPE_VERSIONS.has(getEventBlob(ev).crypto_version)) {
      state.lastAppliedVersion = ev.version;
      continue;
    }

    const row = parseFolderPlaintextV2Utf8(plaintextBytes);
    if (!row || row.workspaceId !== workspaceId) {
      state.lastAppliedVersion = ev.version;
      continue;
    }

    switch (ev.eventType) {
      case "FOLDER_CREATE":
      case "FOLDER_UPDATE": {
        if (row.deleted) {
          removeFolder(state, row.folderId);
        } else {
          state.folders.set(row.folderId, row);
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
    state.lastAppliedVersion = ev.version;
  }

  return state;
}

export function buildFolderTreeFromFlat(
  folders: Map<string, FolderPlaintextV2>,
): WorkspaceFolderTreeNode[] {
  const childrenByParent = new Map<string | null, FolderPlaintextV2[]>();
  for (const folder of folders.values()) {
    const parent = folder.parentFolderId;
    const list = childrenByParent.get(parent) ?? [];
    list.push(folder);
    childrenByParent.set(parent, list);
  }

  const buildLevel = (parentId: string | null): WorkspaceFolderTreeNode[] => {
    const rows = childrenByParent.get(parentId) ?? [];
    return rows
      .sort((a, b) => {
        const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (order !== 0) {
          return order;
        }
        return a.name.localeCompare(b.name) || a.folderId.localeCompare(b.folderId);
      })
      .map((row) => ({
        id: row.folderId,
        label: row.name,
        children: buildLevel(row.folderId),
      }))
      .map((node) => (node.children?.length ? node : { id: node.id, label: node.label }));
  };

  return buildLevel(null);
}
