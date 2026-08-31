import {
  createImporter,
  mapImportResultToOkkeyItems,
  type ImportResult,
  type OkkeyImportItemDraft,
} from "@okkey/import";
import { generateEntityId, type ItemPlaintextV2 } from "@okkey/types";
import { serializeKeyFieldFileValue, parseKeyFieldFileValue, type KeyFieldFileValue } from "@okkey/ui";

import { uploadEncryptedAttachment } from "../api/key-field-files";

export type ImportOrchestratorProgress = {
  phase: "parsing" | "importing" | "done";
  processed: number;
  total: number;
  currentTitle?: string;
};

export type ImportOrchestratorResult = {
  createdCount: number;
  skippedCount: number;
  errors: string[];
};

export async function runVaultImport(params: {
  formatId: string;
  text: string;
  attachmentFiles?: Map<string, Uint8Array>;
  vaultId: string;
  targetFolderId: string | null;
  importFolders?: boolean;
  accessToken: string;
  vaultKey: Uint8Array;
  exportPassword?: string;
  createItem: (item: ItemPlaintextV2) => Promise<string>;
  updateItem: (item: ItemPlaintextV2) => Promise<string>;
  assignItemToFolder: (itemId: string, folderId: string | null) => Promise<void>;
  createFolder?: (label: string, parentFolderId?: string | null) => Promise<string>;
  setItemFavorite?: (itemId: string, favorite: boolean) => Promise<void>;
  onProgress?: (progress: ImportOrchestratorProgress) => void;
}): Promise<ImportOrchestratorResult> {
  params.onProgress?.({ phase: "parsing", processed: 0, total: 0 });

  const importer = createImporter(params.formatId, { password: params.exportPassword });
  const importResult: ImportResult = await importer.parse(params.text);
  if (!importResult.success) {
    return {
      createdCount: 0,
      skippedCount: 0,
      errors: [importResult.errorMessage ?? "Import parse failed"],
    };
  }

  const drafts = mapImportResultToOkkeyItems({
    result: importResult,
    vaultId: params.vaultId,
    attachmentFiles: params.attachmentFiles,
  });

  const errors = [...importResult.errors.map((error) => error.message)];
  let createdCount = 0;

  const folderIdByImportIndex = params.importFolders
    ? await createImportedFolderTree({
        importResult,
        targetFolderId: params.targetFolderId,
        createFolder: params.createFolder,
        errors,
      })
    : new Map<number, string>();

  const cipherFolderIndex = new Map<number, number>();
  for (const [cipherIndex, folderIndex] of importResult.folderRelationships) {
    cipherFolderIndex.set(cipherIndex, folderIndex);
  }

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    params.onProgress?.({
      phase: "importing",
      processed: index,
      total: drafts.length,
      currentTitle: draft.item.title,
    });

    try {
      const itemId = await importDraftItem({
        draft,
        vaultId: params.vaultId,
        accessToken: params.accessToken,
        vaultKey: params.vaultKey,
        createItem: params.createItem,
        updateItem: params.updateItem,
      });

      const importFolderIndex = cipherFolderIndex.get(index);
      const mappedFolderId =
        importFolderIndex != null ? folderIdByImportIndex.get(importFolderIndex) : undefined;
      const assignTo =
        params.importFolders && mappedFolderId
          ? mappedFolderId
          : params.targetFolderId;

      if (assignTo) {
        await params.assignItemToFolder(itemId, assignTo);
      }

      if (draft.favorite && params.setItemFavorite) {
        await params.setItemFavorite(itemId, true);
      }

      createdCount += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Import item failed");
    }
  }

  params.onProgress?.({
    phase: "done",
    processed: drafts.length,
    total: drafts.length,
  });

  return {
    createdCount,
    skippedCount: Math.max(0, drafts.length - createdCount),
    errors,
  };
}

async function createImportedFolderTree(params: {
  importResult: ImportResult;
  targetFolderId: string | null;
  createFolder?: (label: string, parentFolderId?: string | null) => Promise<string>;
  errors: string[];
}): Promise<Map<number, string>> {
  const folderIdByImportIndex = new Map<number, string>();
  if (!params.createFolder || params.importResult.folders.length === 0) {
    return folderIdByImportIndex;
  }

  const pathToOkkeyId = new Map<string, string>();

  const normalized = params.importResult.folders.map((folder, index) => ({
    index,
    path: normalizeImportFolderPath(folder.name),
  }));

  // Parents before children by path depth, then lexicographically.
  normalized.sort((a, b) => {
    const depthDiff = a.path.split("/").filter(Boolean).length - b.path.split("/").filter(Boolean).length;
    if (depthDiff !== 0) {
      return depthDiff;
    }
    return a.path.localeCompare(b.path);
  });

  // Ensure every parent path segment exists even if missing from export list.
  const allPaths = new Set<string>();
  for (const entry of normalized) {
    if (!entry.path) {
      continue;
    }
    const parts = entry.path.split("/");
    for (let i = 1; i <= parts.length; i += 1) {
      allPaths.add(parts.slice(0, i).join("/"));
    }
  }

  const orderedPaths = [...allPaths].sort((a, b) => {
    const depthDiff = a.split("/").length - b.split("/").length;
    if (depthDiff !== 0) {
      return depthDiff;
    }
    return a.localeCompare(b);
  });

  for (const path of orderedPaths) {
    if (pathToOkkeyId.has(path)) {
      continue;
    }
    const parts = path.split("/");
    const segment = parts[parts.length - 1] ?? "";
    const parentPath = parts.slice(0, -1).join("/");
    const parentId = parentPath
      ? pathToOkkeyId.get(parentPath) ?? params.targetFolderId
      : params.targetFolderId;
    try {
      const createdId = await params.createFolder(segment, parentId);
      if (createdId) {
        pathToOkkeyId.set(path, createdId);
      }
    } catch (error) {
      params.errors.push(
        error instanceof Error ? error.message : `Failed to create folder "${path}"`,
      );
    }
  }

  for (const entry of normalized) {
    const id = entry.path ? pathToOkkeyId.get(entry.path) : undefined;
    if (id) {
      folderIdByImportIndex.set(entry.index, id);
    }
  }

  return folderIdByImportIndex;
}

function normalizeImportFolderPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/g, "").replace(/\/+$/g, "").trim();
}

async function importDraftItem(params: {
  draft: OkkeyImportItemDraft;
  vaultId: string;
  accessToken: string;
  vaultKey: Uint8Array;
  createItem: (item: ItemPlaintextV2) => Promise<string>;
  updateItem: (item: ItemPlaintextV2) => Promise<string>;
}): Promise<string> {
  const itemWithVault = { ...params.draft.item, vaultId: params.vaultId };
  const itemId = await params.createItem(itemWithVault);

  if (params.draft.attachments.length === 0) {
    return itemId;
  }

  let item = { ...itemWithVault, itemId };
  for (const attachment of params.draft.attachments) {
    const uploaded = await uploadEncryptedAttachment({
      accessToken: params.accessToken,
      vaultId: params.vaultId,
      itemId,
      vaultKey: params.vaultKey,
      plaintext: attachment.bytes,
      name: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.bytes.byteLength,
    });
    item = appendFileField(item, uploaded);
  }

  await params.updateItem(item);
  return itemId;
}

function appendFileField(item: ItemPlaintextV2, file: KeyFieldFileValue): ItemPlaintextV2 {
  const sectionId = item.sections[0]?.id ?? generateEntityId();
  const sections =
    item.sections.length > 0
      ? item.sections
      : [{ id: sectionId, title: "Attachments", order: 0, isPreset: false }];

  return {
    ...item,
    sections,
    fields: [
      ...item.fields,
      {
        id: generateEntityId(),
        type: "file",
        sectionId,
        order: item.fields.length,
        label: file.name ?? "Attachment",
        value: (() => {
          const parsed = parseKeyFieldFileValue(serializeKeyFieldFileValue(file));
          if (!parsed) {
            return { kind: "file" as const, name: file.name };
          }
          return {
            kind: "file" as const,
            attachmentId: parsed.attachmentId,
            name: parsed.name,
            mimeType: parsed.mimeType,
            sizeBytes: parsed.sizeBytes,
          };
        })(),
      },
    ],
  };
}
