import type { ApiConfig } from "../config.ts";

export const CRYPTO_POLICY_VIOLATION = "CRYPTO_PROFILE_NOT_ALLOWED";
export const CRYPTO_POLICY_VIOLATION_STATUS_CODE = 400;

export function isCryptoProfileAllowed(config: Pick<ApiConfig, "allowedCryptoProfileVersions">, version: number): boolean {
  return config.allowedCryptoProfileVersions.includes(version);
}

export function assertCryptoProfileAllowed(
  config: Pick<ApiConfig, "allowedCryptoProfileVersions">,
  version: number,
): void {
  if (!isCryptoProfileAllowed(config, version)) {
    throw new Error(`crypto profile v${version} is not allowed by policy`);
  }
}

export function buildCryptoPolicyDetails(
  config: Pick<ApiConfig, "allowedCryptoProfileVersions">,
  version: number,
): Record<string, unknown> {
  return {
    requestedVersion: version,
    allowedVersions: config.allowedCryptoProfileVersions,
  };
}
