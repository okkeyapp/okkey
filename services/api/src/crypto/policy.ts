import type { ApiConfig } from "../config.ts";

export const CRYPTO_POLICY_VIOLATION = "CRYPTO_PROFILE_NOT_ALLOWED";
export const CRYPTO_POLICY_VIOLATION_STATUS_CODE = 400;

export interface CryptoPolicyViolationData {
  code: typeof CRYPTO_POLICY_VIOLATION;
  statusCode: typeof CRYPTO_POLICY_VIOLATION_STATUS_CODE;
  message: string;
  details: Record<string, unknown>;
}

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
    reason: "policy" as const,
    requestedVersion: version,
    allowedVersions: config.allowedCryptoProfileVersions,
  };
}

export function getCryptoWritePolicyViolation(
  config: Pick<ApiConfig, "allowedCryptoProfileVersions">,
  version: number,
): CryptoPolicyViolationData | null {
  if (isCryptoProfileAllowed(config, version)) {
    return null;
  }
  return {
    code: CRYPTO_POLICY_VIOLATION,
    statusCode: CRYPTO_POLICY_VIOLATION_STATUS_CODE,
    message: `crypto profile v${version} is not allowed by policy`,
    details: buildCryptoPolicyDetails(config, version),
  };
}
