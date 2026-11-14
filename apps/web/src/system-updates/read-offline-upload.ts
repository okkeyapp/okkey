/** File picker for the current offline apply call. #306 posts parsed JSON as `document`. */

export const OFFLINE_UPLOAD_ACCEPT =
  "application/json,.okpkg,.json,.okbundle,.zip,application/zip";

export async function readOfflineUpload(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const name = file.name.trim().toLowerCase();
    if (!name.endsWith(".okbundle") && !name.endsWith(".zip")) {
      throw new Error("PACKAGE_INVALID");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return offlineBundleDocumentFromBytes(bytes);
  }
}

/** Same document the apply call expects for a raw .okbundle or .zip archive. */
export function offlineBundleDocumentFromBytes(bytes: Uint8Array): {
  format: "okkey-offline-bundle";
  formatVersion: 1;
  archiveBase64: string;
} {
  return {
    format: "okkey-offline-bundle",
    formatVersion: 1,
    archiveBase64: bytesToBase64(bytes),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
