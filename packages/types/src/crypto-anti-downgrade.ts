/**
 * Client-side guard: refuse to enqueue ciphertext with a weaker `crypto_version` than the vault
 * stream has already established (mirrors server `CRYPTO_DOWNGRADE_NOT_ALLOWED`).
 *
 * @param establishedMax `null` if unknown or empty vault; otherwise `MAX` seen `crypto_version` from replay.
 */
export function assertCryptoVersionNotBelowFloor(
  establishedMax: number | null,
  candidate: number,
  label = "crypto_version",
): void {
  if (establishedMax !== null && candidate < establishedMax) {
    throw new Error(
      `${label}: v${candidate} is below established floor v${establishedMax} (anti-downgrade)`,
    );
  }
}
