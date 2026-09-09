import type { ExportSourceItem, RunExportResult } from "@okkey/import";
import { getExportFormatOption, runExport } from "@okkey/import";
import type { ItemPlaintextV2 } from "@okkey/types";

import { downloadKeyFieldFileAttachmentBytes } from "../api/key-field-files";

export type ExportOrchestratorProgress = {
  phase: "collecting" | "building" | "done";
  processed: number;
  total: number;
  currentTitle?: string;
};

export async function runVaultExport(params: {
  formatId: string;
  vaultId: string;
  items: readonly ItemPlaintextV2[];
  itemFolderByItemId: ReadonlyMap<string, string | null>;
  itemFavoriteByItemId: ReadonlySet<string>;
  folderPathById: (folderId: string) => string;
  includeFolders?: boolean;
  password?: string;
  accessToken: string;
  vaultKey: Uint8Array;
  onProgress?: (progress: ExportOrchestratorProgress) => void;
}): Promise<RunExportResult> {
  const option = getExportFormatOption(params.formatId);
  if (!option) {
    throw new Error(`Unknown export format: ${params.formatId}`);
  }

  const vaultItems = params.items.filter(
    (item) => item.vaultId === params.vaultId && !item.deleted,
  );

  params.onProgress?.({
    phase: "collecting",
    processed: 0,
    total: vaultItems.length,
  });

  const sources: ExportSourceItem[] = [];
  for (let index = 0; index < vaultItems.length; index += 1) {
    const item = vaultItems[index]!;
    params.onProgress?.({
      phase: "collecting",
      processed: index,
      total: vaultItems.length,
      currentTitle: item.title,
    });

    const folderId = params.itemFolderByItemId.get(item.itemId) ?? null;
    const folderPathRaw = folderId ? params.folderPathById(folderId) : "";
    const folderPath = folderPathRaw
      ? folderPathRaw
          .split(/\s*\/\s*/)
          .map((part) => part.trim())
          .filter(Boolean)
          .join("/")
      : null;

    const attachmentBytesByFieldId = option.supportsAttachments
      ? await collectAttachments({
          item,
          accessToken: params.accessToken,
          vaultKey: params.vaultKey,
        })
      : undefined;

    sources.push({
      item,
      folderPath,
      favorite: params.itemFavoriteByItemId.has(item.itemId),
      attachmentBytesByFieldId,
    });
  }

  params.onProgress?.({
    phase: "building",
    processed: vaultItems.length,
    total: vaultItems.length,
  });

  const result = await runExport({
    formatId: params.formatId,
    items: sources,
    includeFolders: params.includeFolders,
    password: params.password,
  });

  params.onProgress?.({
    phase: "done",
    processed: vaultItems.length,
    total: vaultItems.length,
  });

  return result;
}

async function collectAttachments(params: {
  item: ItemPlaintextV2;
  accessToken: string;
  vaultKey: Uint8Array;
}): Promise<Map<string, { fileName: string; bytes: Uint8Array }>> {
  const map = new Map<string, { fileName: string; bytes: Uint8Array }>();
  for (const field of params.item.fields) {
    if (field.type !== "file" || field.value.kind !== "file") {
      continue;
    }
    const attachmentId = field.value.attachmentId;
    if (!attachmentId) {
      continue;
    }
    try {
      const downloaded = await downloadKeyFieldFileAttachmentBytes({
        accessToken: params.accessToken,
        vaultId: params.item.vaultId,
        itemId: params.item.itemId,
        file: {
          attachmentId,
          name: field.value.name ?? "file",
          mimeType: field.value.mimeType ?? "application/octet-stream",
          sizeBytes: field.value.sizeBytes ?? 0,
        },
        vaultKey: params.vaultKey,
      });
      map.set(field.id, {
        fileName: field.value.name || downloaded.name || "file",
        bytes: downloaded.plaintext,
      });
    } catch {
      // Skip failed attachments; export continues without them.
    }
  }
  return map;
}

export function downloadExportBlob(result: RunExportResult): void {
  const copy = new Uint8Array(result.bytes.byteLength);
  copy.set(result.bytes);
  const blob = new Blob([copy.buffer], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
