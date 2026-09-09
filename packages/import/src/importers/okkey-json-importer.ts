import { normalizeItemPlaintextV2, type ItemPlaintextV2 } from "@okkey/types";

import {
  isOkkeyExportBundle,
  OKKEY_EXPORT_FORMAT,
  OKKEY_EXPORT_FORMAT_VERSION,
  type OkkeyExportAttachmentRef,
  type OkkeyExportBundleV1,
  type OkkeyExportFaviconRef,
  type OkkeyExportItemV1,
  type OkkeyNativeImportEntry,
} from "../types/okkey-export.js";
import { FolderView } from "../types/views/folder.view.js";
import { ImportResult } from "../types/import-result.js";
import {
  decryptOkkeyPasswordProtectedExport,
  isOkkeyPasswordProtected,
} from "../utils/okkey-password-protected.js";
import {
  ImportPasswordRequiredError,
} from "../utils/bitwarden-password-protected.js";
import type { Importer } from "./importer.js";

export type OkkeyJsonImporterOptions = {
  password?: string;
};

export class OkkeyJsonImporter implements Importer {
  constructor(private readonly options: OkkeyJsonImporterOptions = {}) {}

  async parse(data: string): Promise<ImportResult> {
    const result = new ImportResult();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      result.success = false;
      result.errorMessage = "Invalid Okkey JSON export";
      return result;
    }

    if (isOkkeyPasswordProtected(parsed)) {
      if (!this.options.password?.trim()) {
        throw new ImportPasswordRequiredError("Encrypted Okkey export requires export password");
      }
      const clearText = await decryptOkkeyPasswordProtectedExport(parsed, this.options.password);
      return this.parse(clearText);
    }

    if (!isOkkeyExportBundle(parsed)) {
      result.success = false;
      result.errorMessage = "Invalid Okkey JSON export";
      return result;
    }

    return populateImportResultFromOkkeyBundle(parsed);
  }
}

export function populateImportResultFromOkkeyBundle(bundle: OkkeyExportBundleV1): ImportResult {
  const result = new ImportResult();
  const pathToIndex = new Map<string, number>();

  for (const folder of bundle.folders) {
    const path = normalizeFolderPath(folder.path);
    if (!path || pathToIndex.has(path)) {
      continue;
    }
    pathToIndex.set(path, result.folders.length);
    const view = new FolderView();
    view.name = path;
    result.folders.push(view);
  }

  for (const entry of bundle.items) {
    const normalized = normalizeExportItem(entry);
    if (!normalized) {
      result.errors.push({ type: "item", message: `Skipped invalid item "${entry.item?.title ?? ""}"` });
      continue;
    }

    const cipherIndex = result.nativeEntries.length;
    result.nativeEntries.push(normalized);

    const folderPath = normalized.folderPath;
    if (folderPath) {
      ensureFolderPath(result, pathToIndex, folderPath);
      const folderIndex = pathToIndex.get(folderPath);
      if (folderIndex != null) {
        result.folderRelationships.push([cipherIndex, folderIndex]);
      }
    }
  }

  result.success = true;
  return result;
}

function normalizeExportItem(entry: OkkeyExportItemV1): OkkeyNativeImportEntry | null {
  const item = normalizeItemPlaintextV2(entry.item);
  if (!item) {
    return null;
  }
  const folderPath = entry.folderPath ? normalizeFolderPath(entry.folderPath) : null;
  const attachmentRefs = Array.isArray(entry.attachments)
    ? entry.attachments.filter(
        (ref): ref is OkkeyExportAttachmentRef =>
          Boolean(ref?.fieldId && ref?.fileName && ref?.relativePath),
      )
    : [];
  const favicon = normalizeFaviconRef(entry.favicon);
  return {
    item: clearFileAttachmentIds(item),
    folderPath: folderPath || null,
    favorite: Boolean(entry.favorite),
    attachmentRefs,
    ...(favicon ? { favicon } : {}),
  };
}

function normalizeFaviconRef(value: unknown): OkkeyExportFaviconRef | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
  if (!fileName) {
    return undefined;
  }
  const relativePath =
    typeof record.relativePath === "string" && record.relativePath.trim()
      ? record.relativePath.trim()
      : undefined;
  const dataBase64 =
    typeof record.dataBase64 === "string" && record.dataBase64.trim()
      ? record.dataBase64.trim()
      : undefined;
  if (!relativePath && !dataBase64) {
    return undefined;
  }
  const source =
    record.source === "manual" || record.source === "website" ? record.source : undefined;
  return {
    fileName,
    ...(relativePath ? { relativePath } : {}),
    ...(dataBase64 ? { dataBase64 } : {}),
    ...(source ? { source } : {}),
  };
}

function clearFileAttachmentIds(item: ItemPlaintextV2): ItemPlaintextV2 {
  const next: ItemPlaintextV2 = {
    ...item,
    fields: item.fields.map((field) => {
      if (field.type !== "file" || field.value.kind !== "file") {
        return field;
      }
      return {
        ...field,
        value: {
          kind: "file" as const,
          name: field.value.name,
          mimeType: field.value.mimeType,
          sizeBytes: field.value.sizeBytes,
        },
      };
    }),
  };
  delete next.faviconId;
  return next;
}

function ensureFolderPath(
  result: ImportResult,
  pathToIndex: Map<string, number>,
  path: string,
): void {
  const parts = path.split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i += 1) {
    const partial = parts.slice(0, i).join("/");
    if (pathToIndex.has(partial)) {
      continue;
    }
    pathToIndex.set(partial, result.folders.length);
    const view = new FolderView();
    view.name = partial;
    result.folders.push(view);
  }
}

export function normalizeFolderPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/g, "").replace(/\/+$/g, "").trim();
}

export function createEmptyOkkeyBundle(): OkkeyExportBundleV1 {
  return {
    format: OKKEY_EXPORT_FORMAT,
    formatVersion: OKKEY_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    folders: [],
    items: [],
  };
}
