export const CRYPTO_ROLLOUT_PAUSED = "CRYPTO_ROLLOUT_PAUSED";
export const CRYPTO_ROLLOUT_PAUSED_STATUS_CODE = 503;

export type CryptoRolloutState = "resume" | "stop";

export interface CryptoRolloutGatesConfig {
  cryptoRolloutEnabled?: boolean;
  cryptoRolloutState?: CryptoRolloutState;
  cryptoRolloutStopWritePaths?: string[];
}

export interface CryptoRolloutGateViolation {
  code: typeof CRYPTO_ROLLOUT_PAUSED;
  statusCode: typeof CRYPTO_ROLLOUT_PAUSED_STATUS_CODE;
  message: string;
  details: Record<string, unknown>;
}

function shouldStopByPath(path: string, stopPaths: string[] | undefined): boolean {
  const normalizedPath = path.trim().toLowerCase();
  const normalizedStopPaths = (stopPaths ?? []).map((item) => item.trim().toLowerCase());
  if (normalizedStopPaths.length === 0) {
    return true;
  }
  return normalizedStopPaths.includes("*") || normalizedStopPaths.includes(normalizedPath);
}

export function getCryptoRolloutGateViolation(
  config: CryptoRolloutGatesConfig | undefined,
  path: string,
): CryptoRolloutGateViolation | null {
  if (config?.cryptoRolloutEnabled === false) {
    return {
      code: CRYPTO_ROLLOUT_PAUSED,
      statusCode: CRYPTO_ROLLOUT_PAUSED_STATUS_CODE,
      message: "crypto rollout is globally disabled by configuration",
      details: {
        reason: "rollout_disabled",
        path,
      },
    };
  }
  if (config?.cryptoRolloutState !== "stop") {
    return null;
  }
  if (!shouldStopByPath(path, config.cryptoRolloutStopWritePaths)) {
    return null;
  }
  return {
    code: CRYPTO_ROLLOUT_PAUSED,
    statusCode: CRYPTO_ROLLOUT_PAUSED_STATUS_CODE,
    message: "crypto rollout is paused for this write path",
    details: {
      reason: "rollout_paused",
      path,
      rolloutState: config.cryptoRolloutState,
      stopWritePaths: config.cryptoRolloutStopWritePaths ?? [],
    },
  };
}
