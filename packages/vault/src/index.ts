import type { Item, Vault } from "@okkey/types";
import type {
  CapsuleCreateRequestDto,
  EncryptedBlobDto,
  CapsuleMetadataDto,
  CapsuleOpenResponseDto,
} from "@okkey/types";

export { bytesToBase64, base64ToBytes } from "./base64.js";
export {
  mapVaultUnlockBootstrapToStored,
  parseStoredVaultBundle,
  type StoredVaultBundle,
} from "./vault-bundle.js";
export {
  unlockWithMasterPassword,
  type UnlockWithMasterPasswordResult,
} from "./unlock-with-master-password.js";
export {
  formatTagSearchQuery,
  itemRecordMatchesTagSearch,
  parseTagSearchNeedle,
  scoreItemsListRecordSearch,
  type ItemsListSearchableRecord,
} from "./workspace-item-search.js";
export {
  collectItemUrls,
  extractReadableItemFields,
  itemPlaintextToExtensionListRecord,
  readFirstNonSecretFilledFieldDescription,
  type ExtensionItemListRecord,
  type ReadableItemField,
} from "./item-field-extract.js";
export {
  itemHasUrlMatchingTab,
  itemUrlMatchesTab,
  itemUrlsMatchTab,
  type UrlAutofillScope,
} from "./item-url-match.js";
export {
  resolveVaultItemEncryptionKey,
  type VaultIdentityKeys,
} from "./resolve-vault-item-key.js";
export {
  createWorkspaceVaultItemsReadController,
  type WorkspaceVaultItemsReadController,
  type VaultItemActivityWireEntry,
} from "./workspace-vault-items-read.js";
export {
  withItemArchivedState,
  withItemDeletedState,
} from "./item-mutate.js";
export {
  DEFAULT_VAULT_IDLE_LOCK_MS,
  vaultIdleLockMsFromServerSeconds,
} from "./vault-idle-lock-ms.js";
export {
  CLIPBOARD_CLEAR_OPTIONS_SECONDS,
  DEFAULT_VAULT_DEVICE_PREFS,
  IDLE_LOCK_OPTIONS_SECONDS,
  SECTION_REAUTH_ZONE_IDS,
  parseVaultDevicePrefs,
  patchVaultDevicePrefsAsync,
  readVaultDevicePrefsAsync,
  serializeVaultDevicePrefs,
  vaultDevicePrefsKey,
  writeVaultDevicePrefsAsync,
  type SectionReauthZoneId,
  type VaultDevicePrefs,
  type VaultDevicePrefsStorage,
} from "./vault-device-prefs.js";
export {
  _resetVaultClipboardClearForTests,
  copyTextWithVaultClipboardPolicy,
  scheduleClipboardClearAfterCopy,
} from "./vault-clipboard-clear.js";
export {
  VAULT_UNLOCK_SESSION_STORAGE_KEY,
  clearVaultUnlockSession,
  persistVaultUnlockSession,
  readVaultUnlockSessionIfFresh,
  touchVaultUnlockSession,
  vaultUnlockSessionExceededIdle,
  type VaultUnlockSessionFreshResult,
  type VaultUnlockSessionRecord,
  type VaultUnlockSessionStorage,
} from "./vault-unlock-session.js";
export {
  createWorkspaceFoldersSyncController,
  clearWorkspaceFoldersMaterializedCache,
  folderIdsToTombstoneForRebaseline,
  parsePersonalEventsVersionMismatch,
  refreshWorkspaceFoldersCachesForIds,
  rebaselineWorkspaceFoldersFromLocalCache,
  replayStateToFlatFolders,
  shouldResealLocalFoldersForStreamKey,
  AGENT_REPAIR_PROBE_FOLDER_NAME,
  type WorkspaceFoldersSyncController,
  type WorkspaceFoldersRefreshDiagnostics,
} from "./folders/workspaceFoldersSync.js";
export {
  NO_FOLDER_VALUE,
  createWorkspaceFolderAtRoot,
  findWorkspaceFolderPathById,
  flattenWorkspaceFolders,
  folderPathExists,
  toSidebarFolderTree,
  workspaceFolderIdExists,
  type FlatWorkspaceFolder,
  type WorkspaceFolderNode,
} from "./folders/workspaceFolderTree.js";
export {
  compareFolderSiblingOrder,
  diffWorkspaceFolderTrees,
  normalizeWorkspaceFolderTreeForSave,
  rowsToWorkspaceTree,
  workspaceTreeToRowMap,
  type FolderRowSnapshot,
  type FolderTreeMutation,
} from "./folders/folderTreeCommit.js";
export { IndexedDbWorkspacePersonalOutboxStore } from "./folders/workspacePersonalOutboxStore.js";
export {
  downloadKeyFieldFileAttachment,
  downloadKeyFieldFileAttachmentBytes,
  keyFieldFileAttachmentIsImage,
  keyFieldFileValueFromFaviconId,
  type DownloadedKeyFieldFileAttachmentBytes,
  type DownloadKeyFieldFileAttachmentBytesInput,
  type DownloadKeyFieldFileAttachmentInput,
} from "./key-field-file-attachments.js";

export interface VaultStore {
  listVaults(): Promise<Vault[]>;
  listItems(vaultId: string): Promise<Item[]>;
  getItem(vaultId: string, itemId: string): Promise<Item | null>;
  saveItem(vaultId: string, item: Item): Promise<void>;
  deleteItem(vaultId: string, itemId: string): Promise<void>;
}

export interface BuildCapsuleCreateInput {
  type: "text" | "item" | "file";
  plaintext: Uint8Array;
  encrypt: (plaintext: Uint8Array) => Promise<Uint8Array>;
  encryptedMetadata: EncryptedBlobDto;
  ownerKeyWrap: EncryptedBlobDto;
  activateAt?: string;
  deactivateAt?: string;
  deleteAt?: string;
  maxViews?: number;
  viewLimitAction?: "deactivate" | "delete";
  password?: string;
  passwordAttemptLimit?: number;
  allowedRecipientEmails?: string[];
  approvalRequired?: boolean;
  keyTransportMode?: "fragment" | "out_of_band";
  filePlaintext?: Uint8Array;
}

export interface BuildCapsuleCreateResult {
  request: CapsuleCreateRequestDto;
}

export async function buildCapsuleCreateRequest(
  input: BuildCapsuleCreateInput,
): Promise<BuildCapsuleCreateResult> {
  const encryptedPayload = toEncryptedBlobDto(await input.encrypt(input.plaintext));
  let filePayload: EncryptedBlobDto | undefined;
  if (input.filePlaintext) {
    filePayload = toEncryptedBlobDto(await input.encrypt(input.filePlaintext));
  }
  return {
    request: {
      type: input.type,
      encryptedPayload,
      encryptedMetadata: input.encryptedMetadata,
      ownerKeyWrap: input.ownerKeyWrap,
      ...(filePayload ? { filePayload } : {}),
      ...(input.activateAt ? { activateAt: input.activateAt } : {}),
      ...(input.deactivateAt ? { deactivateAt: input.deactivateAt } : {}),
      ...(input.deleteAt ? { deleteAt: input.deleteAt } : {}),
      ...(input.maxViews !== undefined ? { maxViews: input.maxViews } : {}),
      ...(input.viewLimitAction ? { viewLimitAction: input.viewLimitAction } : {}),
      ...(input.password ? { password: input.password } : {}),
      ...(input.passwordAttemptLimit !== undefined
        ? { passwordAttemptLimit: input.passwordAttemptLimit }
        : {}),
      ...(input.allowedRecipientEmails ? { allowedRecipientEmails: input.allowedRecipientEmails } : {}),
      ...(input.approvalRequired ? { approvalRequired: true } : {}),
      ...(input.keyTransportMode ? { keyTransportMode: input.keyTransportMode } : {}),
    },
  };
}

export interface OpenCapsuleInput {
  response: CapsuleOpenResponseDto;
  decrypt: (ciphertext: Uint8Array) => Promise<Uint8Array>;
}

export interface OpenCapsuleResult {
  metadata: CapsuleMetadataDto;
  plaintext: Uint8Array;
  filePlaintext?: Uint8Array;
}

export async function openCapsulePayload(input: OpenCapsuleInput): Promise<OpenCapsuleResult> {
  const payloadBytes = Uint8Array.from(Buffer.from(input.response.encryptedPayload.payload, "base64"));
  const plaintext = await input.decrypt(payloadBytes);
  const metadata: CapsuleMetadataDto = {
    capsuleId: input.response.capsuleId,
    type: input.response.type,
    state: input.response.state,
    activateAt: input.response.activateAt,
    deactivateAt: input.response.deactivateAt,
    deleteAt: input.response.deleteAt,
    maxViews: input.response.maxViews,
    viewCount: input.response.viewCount,
    viewLimitAction: input.response.viewLimitAction,
    passwordRequired: input.response.passwordRequired,
    passwordAttemptLimit: input.response.passwordAttemptLimit,
    recipientRestricted: input.response.recipientRestricted,
    approvalRequired: input.response.approvalRequired,
    createdAt: input.response.createdAt,
    updatedAt: input.response.updatedAt,
  };
  let filePlaintext: Uint8Array | undefined;
  if (input.response.filePayload) {
    filePlaintext = await input.decrypt(
      Uint8Array.from(Buffer.from(input.response.filePayload.payload, "base64")),
    );
  }
  return { metadata, plaintext, ...(filePlaintext ? { filePlaintext } : {}) };
}

function toEncryptedBlobDto(payload: Uint8Array): EncryptedBlobDto {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {},
  };
}
