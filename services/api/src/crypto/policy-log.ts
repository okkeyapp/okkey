import type { Logger } from "../logger.ts";
import { incrementCryptoMetric } from "../observability/crypto-rollout.ts";

export type CryptoPolicyViolationReason = "policy" | "downgrade" | "capability";

/**
 * Structured security log for crypto policy rejections (observability / future metrics).
 * Never include ciphertext, keys, or passwords.
 */
export function logCryptoPolicyViolation(
  logger: Logger | undefined,
  fields: {
    reason: CryptoPolicyViolationReason;
    deployEnv: string;
    vaultId?: string;
    actorId?: string;
    requestedVersion?: number;
    establishedMaxVersion?: number;
    rolloutMode?: string;
    missingCapabilities?: string[];
  },
): void {
  if (!logger) {
    return;
  }
  incrementCryptoMetric(logger, "crypto.policy_violations_total", {
    reason: fields.reason,
    deploy_env: fields.deployEnv,
    rollout_mode: fields.rolloutMode,
  });
  logger.warn("crypto_policy_violation", {
    event: "crypto_policy_violation",
    ...fields,
  });
}
