import {
  OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES,
  isOfflineUploadTooLarge,
} from "@okkey/types";

import type { SystemUpdateComponent } from "./visibility";

/** Combined package archives. A binary archive is wrapped and unpacked by the update agent. */
export const OFFLINE_ARCHIVE_EXTENSIONS = [".okbundle", ".zip"] as const;

/** Signed package plus the combined archive extensions the picker accepts. */
export const OFFLINE_PACKAGE_EXTENSIONS = ["okpkg", "json", "okbundle", "zip"] as const;

/**
 * Upper bound for one offline package or archive in the file field.
 * Matches the server document / apply-body ceiling from `@okkey/types`.
 */
export const OFFLINE_PACKAGE_MAX_SIZE_BYTES = OFFLINE_BUNDLE_MAX_DOCUMENT_BYTES;

export const OFFLINE_FILE_ACCEPT =
  ".okpkg,.json,.okbundle,.zip,application/json,application/zip";

export type OfflinePackageChoice = {
  kind: "package";
  fileName: string;
  component: SystemUpdateComponent;
  version: string;
  minCoreVersion: string | null;
  document: unknown;
};

export type OfflineArchiveChoice = {
  kind: "archive";
  fileName: string;
  /** Parsed JSON body, present when the archive file itself is JSON. */
  document: unknown | null;
};

export type OfflineInvalidChoice = {
  kind: "invalid";
  fileName: string;
};

export type OfflineChoice = OfflinePackageChoice | OfflineArchiveChoice | OfflineInvalidChoice;

export function isCombinedArchiveName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return OFFLINE_ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Reject oversized offline uploads before reading or posting them. */
export function offlineFileExceedsSizeLimit(file: { size: number }): boolean {
  return isOfflineUploadTooLarge(file.size);
}

/** Read component and version from a signed package. Archive bytes are wrapped elsewhere. */
export function classifyOfflineFile(fileName: string, text: string): OfflineChoice {
  if (isCombinedArchiveName(fileName)) {
    return { kind: "archive", fileName, document: parseJson(text) };
  }
  const document = parseJson(text);
  const payload = signedPayload(document);
  const component = payload?.component;
  const version = typeof payload?.version === "string" ? payload.version.trim() : "";
  if ((component === "okkey" || component === "enterprise") && version) {
    const minCoreVersion = payload?.minCoreVersion;
    return {
      kind: "package",
      fileName,
      component,
      version,
      minCoreVersion:
        typeof minCoreVersion === "string" && minCoreVersion.trim() ? minCoreVersion.trim() : null,
      document,
    };
  }
  return { kind: "invalid", fileName };
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function signedPayload(document: unknown): Record<string, unknown> | null {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return null;
  }
  const payload = (document as Record<string, unknown>).payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}
