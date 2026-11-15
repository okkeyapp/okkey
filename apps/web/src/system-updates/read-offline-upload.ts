/** File picker for the current offline apply call. #306 posts parsed JSON as `document`. */

export const OFFLINE_UPLOAD_ACCEPT =
  "application/json,.okpkg,.json,.okbundle,.zip,application/zip";

export async function readOfflineUpload(file: File): Promise<unknown> {
  const bytes = await readFileBytes(file);
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const name = file.name.trim().toLowerCase();
    if (!name.endsWith(".okbundle") && !name.endsWith(".zip")) {
      throw new Error("PACKAGE_INVALID");
    }
    return {
      format: "okkey-offline-bundle",
      formatVersion: 1,
      archiveBase64: bytesToBase64(bytes),
    };
  }
}

/** jsdom's File often has no `.text()` or `.arrayBuffer()`. FileReader covers that. */
function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
        return;
      }
      reject(new Error("PACKAGE_INVALID"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("PACKAGE_INVALID"));
    reader.readAsArrayBuffer(file);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
