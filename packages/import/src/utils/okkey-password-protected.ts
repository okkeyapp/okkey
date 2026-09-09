import {
  decryptBitwardenPasswordProtectedExport,
  encryptPasswordProtectedExport,
  isPasswordProtectedExportEnvelope,
  type BitwardenPasswordProtectedFile,
} from "./bitwarden-password-protected.js";
import { OKKEY_EXPORT_FORMAT, OKKEY_EXPORT_FORMAT_VERSION } from "../types/okkey-export.js";

export type OkkeyPasswordProtectedFile = BitwardenPasswordProtectedFile & {
  format: typeof OKKEY_EXPORT_FORMAT;
  formatVersion: typeof OKKEY_EXPORT_FORMAT_VERSION;
};

export function isOkkeyPasswordProtected(data: unknown): data is OkkeyPasswordProtectedFile {
  if (!isPasswordProtectedExportEnvelope(data)) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return record.format === OKKEY_EXPORT_FORMAT;
}

export function looksLikeOkkeyPasswordProtectedJson(text: string): boolean {
  try {
    return isOkkeyPasswordProtected(JSON.parse(text) as unknown);
  } catch {
    return false;
  }
}

export async function encryptOkkeyPasswordProtectedExport(
  plaintext: string,
  password: string,
): Promise<OkkeyPasswordProtectedFile> {
  const envelope = await encryptPasswordProtectedExport(plaintext, password);
  return {
    ...envelope,
    format: OKKEY_EXPORT_FORMAT,
    formatVersion: OKKEY_EXPORT_FORMAT_VERSION,
  };
}

export async function decryptOkkeyPasswordProtectedExport(
  file: OkkeyPasswordProtectedFile,
  password: string,
): Promise<string> {
  return decryptBitwardenPasswordProtectedExport(file, password);
}
