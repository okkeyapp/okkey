/**
 * Detect Core `VaultSharingServiceError` without a hard value import
 * (avoids pulling WASM crypto into route modules that only need error mapping).
 */
export type VaultSharingServiceErrorLike = {
  code: string;
  statusCode: number;
  message: string;
  details?: Record<string, unknown>;
};

export function asVaultSharingServiceError(error: unknown): VaultSharingServiceErrorLike | null {
  if (!(error instanceof Error) || error.constructor.name !== "VaultSharingServiceError") {
    return null;
  }
  const candidate = error as {
    code?: unknown;
    statusCode?: unknown;
    message: string;
    details?: unknown;
  };
  if (typeof candidate.code !== "string" || typeof candidate.statusCode !== "number") {
    return null;
  }
  return {
    code: candidate.code,
    statusCode: candidate.statusCode,
    message: candidate.message,
    details:
      candidate.details && typeof candidate.details === "object"
        ? (candidate.details as Record<string, unknown>)
        : undefined,
  };
}
