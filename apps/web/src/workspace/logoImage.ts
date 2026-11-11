export const WORKSPACE_LOGO_MAX_BYTES = 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50] as const;

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

/** png, jpeg, or webp. Rejects SVG and anything the server cannot treat as an opaque logo. */
export function assertWorkspaceLogoImage(bytes: Uint8Array): void {
  if (bytes.length === 0 || bytes.length > WORKSPACE_LOGO_MAX_BYTES) {
    throw new Error("workspace logo must be a png, jpeg, or webp image up to 1 MiB");
  }
  const isPng = startsWith(bytes, PNG);
  const isJpeg = startsWith(bytes, JPEG);
  const isWebp =
    startsWith(bytes, WEBP_RIFF) &&
    bytes.length >= 12 &&
    WEBP_TAG.every((value, index) => bytes[8 + index] === value);
  if (!isPng && !isJpeg && !isWebp) {
    throw new Error("workspace logo must be a png, jpeg, or webp image");
  }
}

/**
 * Upload the new ciphertext first. Deleting a legacy vault attachment is best-effort
 * and must not abort the save (that attachment may live in another member's vault).
 */
export async function commitWorkspaceLogoReplacement(input: {
  ciphertext: Uint8Array;
  putCiphertext: (ciphertext: Uint8Array) => Promise<void>;
  deleteLegacy: (() => Promise<void>) | null;
}): Promise<void> {
  await input.putCiphertext(input.ciphertext);
  if (!input.deleteLegacy) {
    return;
  }
  try {
    await input.deleteLegacy();
  } catch {
    // The encrypted logo is already stored. A failed legacy delete must not roll the save back.
  }
}
