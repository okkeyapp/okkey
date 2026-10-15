export type RecoveryKeyGatePhase = "loading" | "required" | "ready" | "unavailable";

export type RecoveryKeyGateStatus = {
  key: { enrolled: boolean; exportedAt: string | null };
};

export function isRecoveryKeyReady(key: {
  enrolled: boolean;
  exportedAt: string | null;
}): boolean {
  return key.enrolled && Boolean(key.exportedAt);
}

/** Enrolled wrap without export ack — user must create a new secret to save. */
export function recoveryKeyNeedsNewSecret(key: {
  enrolled: boolean;
  exportedAt: string | null;
}): boolean {
  return key.enrolled && !key.exportedAt;
}

export function recoveryKeyGatePhase(input: {
  status: RecoveryKeyGateStatus | null;
  loaded: boolean;
  failed: boolean;
}): RecoveryKeyGatePhase {
  if (!input.loaded) {
    return "loading";
  }
  if (input.failed || !input.status) {
    return "unavailable";
  }
  return isRecoveryKeyReady(input.status.key) ? "ready" : "required";
}
