import type { ItemPlaintextV2 } from "@okkey/types";

export const OKKEY_EXPORT_FORMAT = "okkey" as const;
export const OKKEY_EXPORT_FORMAT_VERSION = 1 as const;

export type OkkeyExportAttachmentRef = {
  fieldId: string;
  fileName: string;
  relativePath: string;
};

export type OkkeyExportItemV1 = {
  item: ItemPlaintextV2;
  folderPath: string | null;
  favorite: boolean;
  attachments?: OkkeyExportAttachmentRef[];
};

export type OkkeyExportBundleV1 = {
  format: typeof OKKEY_EXPORT_FORMAT;
  formatVersion: typeof OKKEY_EXPORT_FORMAT_VERSION;
  exportedAt: string;
  folders: Array<{ path: string }>;
  items: OkkeyExportItemV1[];
};

export type OkkeyNativeImportEntry = {
  item: ItemPlaintextV2;
  folderPath: string | null;
  favorite: boolean;
  attachmentRefs: OkkeyExportAttachmentRef[];
};

export function isOkkeyExportBundle(value: unknown): value is OkkeyExportBundleV1 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.format === OKKEY_EXPORT_FORMAT &&
    record.formatVersion === OKKEY_EXPORT_FORMAT_VERSION &&
    typeof record.exportedAt === "string" &&
    Array.isArray(record.folders) &&
    Array.isArray(record.items)
  );
}
