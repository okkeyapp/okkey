export const CRYPTO_CAPABILITY_REQUIRED = "CRYPTO_CAPABILITY_REQUIRED";
export const CRYPTO_CAPABILITY_REQUIRED_STATUS_CODE = 400;

export type CryptoRolloutMode = "strict" | "compat";
export type CryptoCapabilitySubject = "user" | "device";
export type CryptoCapabilityKey = "pq_identity" | "pq_device";

export interface CapabilityRequirement {
  subject: CryptoCapabilitySubject;
  capability: CryptoCapabilityKey;
  present: boolean;
}

export interface CapabilityDecisionInput {
  mode: CryptoRolloutMode;
  operation: string;
  requirements: CapabilityRequirement[];
}

export interface CapabilityDecision {
  allowed: boolean;
  mode: CryptoRolloutMode;
  missing: CryptoCapabilityKey[];
}

export function evaluateCapabilityDecision(input: CapabilityDecisionInput): CapabilityDecision {
  if (input.mode === "compat") {
    return {
      allowed: true,
      mode: input.mode,
      missing: [],
    };
  }
  const missing = input.requirements.filter((item) => !item.present).map((item) => item.capability);
  return {
    allowed: missing.length === 0,
    mode: input.mode,
    missing,
  };
}

export function buildCapabilityPolicyDetails(input: {
  mode: CryptoRolloutMode;
  operation: string;
  missing: CryptoCapabilityKey[];
  subjectId?: string;
}): Record<string, unknown> {
  return {
    reason: "capability" as const,
    rolloutMode: input.mode,
    operation: input.operation,
    missingCapabilities: input.missing,
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
  };
}
