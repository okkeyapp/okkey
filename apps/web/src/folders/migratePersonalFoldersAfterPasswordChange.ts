/**
 * After master-password change, personal folder events encrypted under old C become unreadable.
 * Re-append current folder / assignment state under the new metadata key derived from C'.
 */
import type { CoreClient } from "@okkey/api";
import {
  decryptPersonalVaultMetadataPayload,
  derivePersonalWorkspaceMetadataKey,
  wipeBytes,
} from "@okkey/crypto";
import {
  generateEntityId,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
  type ItemFolderAssignPlaintextV2,
} from "@okkey/types";
import {
  buildFolderCreateAppendRequest,
  buildItemFolderAssignAppendRequest,
  replayWorkspaceFolderEvents,
  type WorkspaceFolderReplayState,
} from "@okkey/sync";

import { base64ToBytes } from "../auth/base64";

async function materializeWithKey(
  core: CoreClient,
  workspaceId: string,
  passwordShareC: Uint8Array,
): Promise<WorkspaceFolderReplayState> {
  const key = await derivePersonalWorkspaceMetadataKey(passwordShareC, workspaceId);
  try {
    let state: WorkspaceFolderReplayState = {
      folders: new Map(),
      itemFolder: new Map(),
      itemFavorite: new Set(),
      lastAppliedVersion: 0,
    };
    let after = 0;
    for (;;) {
      const page = await core.listWorkspacePersonalEvents(workspaceId, after);
      if (!page.events.length) {
        break;
      }
      state = await replayWorkspaceFolderEvents(
        page.events,
        workspaceId,
        async (b64) => decryptPersonalVaultMetadataPayload(key, base64ToBytes(b64)),
        after,
        state,
      );
      after = state.lastAppliedVersion;
      if (page.events.length < 100) {
        break;
      }
    }
    return state;
  } finally {
    wipeBytes(key);
  }
}

export async function migratePersonalFoldersAfterPasswordChange(input: {
  core: CoreClient;
  workspaceIds: string[];
  oldPasswordShareC: Uint8Array;
  newPasswordShareC: Uint8Array;
}): Promise<void> {
  for (const workspaceId of input.workspaceIds) {
    const state = await materializeWithKey(input.core, workspaceId, input.oldPasswordShareC);
    if (state.folders.size === 0 && state.itemFolder.size === 0) {
      continue;
    }

    const newKey = await derivePersonalWorkspaceMetadataKey(input.newPasswordShareC, workspaceId);
    try {
      let version = state.lastAppliedVersion;
      const folders = [...state.folders.values()].sort((a, b) => a.id.localeCompare(b.id));
      for (const folder of folders) {
        const request = await buildFolderCreateAppendRequest(
          newKey,
          folder,
          version,
          generateEntityId(),
        );
        await input.core.appendWorkspacePersonalEvent(workspaceId, request);
        version += 1;
      }
      for (const [itemId, folderId] of state.itemFolder.entries()) {
        const assign: ItemFolderAssignPlaintextV2 = {
          schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
          itemId,
          workspaceId,
          folderId,
        };
        const request = await buildItemFolderAssignAppendRequest(
          newKey,
          assign,
          version,
          generateEntityId(),
        );
        await input.core.appendWorkspacePersonalEvent(workspaceId, request);
        version += 1;
      }
    } finally {
      wipeBytes(newKey);
    }
  }
}
