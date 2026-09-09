import type { ItemPlaintextV2 } from "@okkey/types";

import {
  createEmptyOkkeyBundle,
  normalizeFolderPath,
} from "../importers/okkey-json-importer.js";
import { serializeOkkeyCsv } from "../importers/okkey-csv-importer.js";
import type {
  OkkeyExportAttachmentRef,
  OkkeyExportBundleV1,
  OkkeyExportFaviconRef,
  OkkeyExportItemV1,
} from "../types/okkey-export.js";
import { encryptOkkeyPasswordProtectedExport } from "../utils/okkey-password-protected.js";
import { encryptPasswordProtectedExport } from "../utils/bitwarden-password-protected.js";
import { createZipFromFiles } from "../utils/zip.js";

export type ExportSourceItem = {
  item: ItemPlaintextV2;
  folderPath: string | null;
  favorite: boolean;
  /** Decrypted attachment bytes keyed by field id. */
  attachmentBytesByFieldId?: Map<string, { fileName: string; bytes: Uint8Array }>;
  /** Decrypted custom/website favicon bytes (PNG). */
  faviconBytes?: { fileName: string; bytes: Uint8Array; source?: "manual" | "website" };
};

export type BuildOkkeyExportParams = {
  items: ExportSourceItem[];
  includeFolders?: boolean;
  password?: string;
};

export async function buildOkkeyJsonExport(params: BuildOkkeyExportParams): Promise<Uint8Array> {
  const bundle = buildOkkeyBundle(params.items, params.includeFolders !== false, false);
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  if (params.password?.trim()) {
    const protectedFile = await encryptOkkeyPasswordProtectedExport(json, params.password);
    return new TextEncoder().encode(`${JSON.stringify(protectedFile, null, 2)}\n`);
  }
  return new TextEncoder().encode(json);
}

export async function buildOkkeyCsvExport(params: BuildOkkeyExportParams): Promise<Uint8Array> {
  const bundle = buildOkkeyBundle(params.items, params.includeFolders !== false, false);
  return new TextEncoder().encode(serializeOkkeyCsv(bundle));
}

export async function buildOkkeyZipExport(params: BuildOkkeyExportParams): Promise<Uint8Array> {
  const { bundle, files } = buildOkkeyZipContents(params.items, params.includeFolders !== false);
  let exportJson = `${JSON.stringify(bundle, null, 2)}\n`;
  if (params.password?.trim()) {
    const protectedFile = await encryptOkkeyPasswordProtectedExport(exportJson, params.password);
    exportJson = `${JSON.stringify(protectedFile, null, 2)}\n`;
  }
  files["export.json"] = exportJson;
  return createZipFromFiles(files);
}

export function buildOkkeyBundle(
  items: ExportSourceItem[],
  includeFolders: boolean,
  withAttachmentRefs: boolean,
): OkkeyExportBundleV1 {
  const bundle = createEmptyOkkeyBundle();
  const folderPaths = new Set<string>();

  for (const source of items) {
    if (source.item.deleted) {
      continue;
    }
    const folderPath =
      includeFolders && source.folderPath ? normalizeFolderPath(source.folderPath) || null : null;
    if (folderPath) {
      folderPaths.add(folderPath);
    }

    const attachments: OkkeyExportAttachmentRef[] = [];
    const item = cloneItemForExport(source.item);
    // Stale MinIO attachment ids are meaningless after import; bytes travel via favicon/attachments.
    delete item.faviconId;

    if (withAttachmentRefs && source.attachmentBytesByFieldId) {
      for (const field of item.fields) {
        if (field.type !== "file" || field.value.kind !== "file") {
          continue;
        }
        const blob = source.attachmentBytesByFieldId.get(field.id);
        if (!blob) {
          continue;
        }
        const safeName = sanitizeFileName(blob.fileName || field.value.name || "file");
        const relativePath = `attachments/${source.item.itemId}/${field.id}/${safeName}`;
        attachments.push({
          fieldId: field.id,
          fileName: safeName,
          relativePath,
        });
        field.value = {
          kind: "file",
          name: safeName,
          mimeType: field.value.mimeType,
          sizeBytes: blob.bytes.byteLength,
        };
      }
    } else {
      // JSON/CSV: strip attachment ids (bytes not embedded).
      for (const field of item.fields) {
        if (field.type === "file" && field.value.kind === "file") {
          field.value = {
            kind: "file",
            name: field.value.name,
            mimeType: field.value.mimeType,
            sizeBytes: field.value.sizeBytes,
          };
        }
      }
    }

    const favicon = buildFaviconRef(source, withAttachmentRefs);

    const entry: OkkeyExportItemV1 = {
      item,
      folderPath,
      favorite: source.favorite,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(favicon ? { favicon } : {}),
    };
    bundle.items.push(entry);
  }

  bundle.folders = [...folderPaths].sort().map((path) => ({ path }));
  return bundle;
}

function buildOkkeyZipContents(
  items: ExportSourceItem[],
  includeFolders: boolean,
): { bundle: OkkeyExportBundleV1; files: Record<string, Uint8Array | string> } {
  const files: Record<string, Uint8Array | string> = {};
  const bundle = buildOkkeyBundle(items, includeFolders, true);
  for (const source of items) {
    if (source.attachmentBytesByFieldId) {
      for (const [fieldId, blob] of source.attachmentBytesByFieldId.entries()) {
        const safeName = sanitizeFileName(blob.fileName);
        const relativePath = `attachments/${source.item.itemId}/${fieldId}/${safeName}`;
        files[relativePath] = blob.bytes;
      }
    }
    if (source.faviconBytes && source.faviconBytes.bytes.byteLength > 0) {
      const safeName = sanitizeFileName(source.faviconBytes.fileName || "favicon.png");
      files[`favicons/${source.item.itemId}/${safeName}`] = source.faviconBytes.bytes;
    }
  }
  return { bundle, files };
}

function buildFaviconRef(
  source: ExportSourceItem,
  withZipPaths: boolean,
): OkkeyExportFaviconRef | undefined {
  const blob = source.faviconBytes;
  if (!blob || blob.bytes.byteLength === 0) {
    return undefined;
  }
  const safeName = sanitizeFileName(blob.fileName || "favicon.png");
  const sourceKind = blob.source ?? source.item.faviconSource;
  if (withZipPaths) {
    return {
      fileName: safeName,
      relativePath: `favicons/${source.item.itemId}/${safeName}`,
      ...(sourceKind ? { source: sourceKind } : {}),
    };
  }
  return {
    fileName: safeName,
    dataBase64: bytesToBase64(blob.bytes),
    ...(sourceKind ? { source: sourceKind } : {}),
  };
}

function cloneItemForExport(item: ItemPlaintextV2): ItemPlaintextV2 {
  const cloned = JSON.parse(JSON.stringify(item)) as ItemPlaintextV2;
  cloned.updatedAtMs = Math.max(cloned.updatedAtMs, cloned.createdAtMs);
  return cloned;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || "file";
  return trimmed.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Shared helper for Bitwarden password-protected JSON export. */
export async function maybePasswordProtectJson(
  json: string,
  password: string | undefined,
): Promise<string> {
  if (!password?.trim()) {
    return json;
  }
  const protectedFile = await encryptPasswordProtectedExport(json, password);
  return `${JSON.stringify(protectedFile, null, 2)}\n`;
}
