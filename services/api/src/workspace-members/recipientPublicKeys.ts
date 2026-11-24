/** Ed25519 public key length (registration / pending wraps). */
export const ED25519_PUBLIC_KEY_LEN = 32;
/** ML-KEM-768 encapsulation key length (FIPS 203). */
export const MLKEM768_ENCAPSULATION_KEY_LEN = 1184;

function decodeBase64Key(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return Uint8Array.from(Buffer.from(trimmed, "base64"));
  } catch {
    return null;
  }
}

/**
 * Same length rules as registration: Ed25519 = 32 bytes, ML-KEM-768 EK = 1184 bytes.
 */
export function recipientPublicKeysAreValid(
  publicKey: string | null | undefined,
  publicPqKey: string | null | undefined,
): boolean {
  if (typeof publicKey !== "string" || typeof publicPqKey !== "string") {
    return false;
  }
  const ed = decodeBase64Key(publicKey);
  const pq = decodeBase64Key(publicPqKey);
  if (!ed || !pq) {
    return false;
  }
  return ed.length === ED25519_PUBLIC_KEY_LEN && pq.length === MLKEM768_ENCAPSULATION_KEY_LEN;
}
