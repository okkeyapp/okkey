export type RecoveryKeyGatePhase = "loading" | "required" | "ready" | "unavailable";

export function recoveryKeyGatePhase(input: {
  status: { key: { enrolled: boolean } } | null;
  loaded: boolean;
  failed: boolean;
}): RecoveryKeyGatePhase {
  if (!input.loaded) {
    return "loading";
  }
  if (input.failed || !input.status) {
    return "unavailable";
  }
  return input.status.key.enrolled ? "ready" : "required";
}
