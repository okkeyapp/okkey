import type { SystemUpdateComponent } from "./visibility";

/** Combined package archives. Reading them belongs to a later API. */
export const OFFLINE_ARCHIVE_EXTENSIONS = [".okbundle", ".zip"] as const;

export const OFFLINE_FILE_ACCEPT =
  "application/json,.okpkg,.json,.okbundle,.zip,application/zip";

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

/** Read component and version from a signed package. Archives are accepted and not unpacked. */
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
