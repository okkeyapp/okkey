import { CryptoDowngradeInvariantError } from "../storage/errors.ts";

export const CRYPTO_DOWNGRADE_NOT_ALLOWED = "CRYPTO_DOWNGRADE_NOT_ALLOWED";
export const CRYPTO_DOWNGRADE_STATUS_CODE = 400;

/** Crypto profile version assigned to all newly created vault rows (production baseline). */
export const DEFAULT_NEW_VAULT_CRYPTO_VERSION = 2;

/**
 * Ensures the vault event stream never moves to a weaker `payload_schema_version` / `crypto_version`
 * than already observed for this vault (anti-downgrade).
 *
 * @param establishedMax `MAX(payload_schema_version)` over existing events, or `null` if there are none.
 */
export function assertPayloadSchemaMonotonic(
  vaultId: string,
  establishedMax: number | null,
  requested: number,
): void {
  if (establishedMax !== null && requested < establishedMax) {
    throw new CryptoDowngradeInvariantError(vaultId, establishedMax, requested);
  }
}

/**
 * Ensures ciphertext `crypto_version` is not below the vault row floor (anti-downgrade).
 */
export function assertVaultCryptoFloor(
  vaultId: string,
  vaultCryptoVersion: number,
  requested: number,
): void {
  if (requested < vaultCryptoVersion) {
    throw new CryptoDowngradeInvariantError(vaultId, vaultCryptoVersion, requested);
  }
}

export function buildCryptoDowngradeDetails(
  vaultId: string,
  establishedMaxVersion: number,
  requestedVersion: number,
): Record<string, unknown> {
  return {
    reason: "downgrade",
    vaultId,
    establishedMaxVersion,
    requestedVersion,
  };
}
