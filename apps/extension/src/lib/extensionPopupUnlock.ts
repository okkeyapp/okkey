/**
 * Extension popup lock-screen unlock mode selection and biometric attempt gate.
 * Keeps WebAuthn to at most one in-flight call per unlock attempt.
 */

export type ExtensionUnlockMode = "biometric" | "pin" | "master";

export type ExtensionUnlockGateInput = {
  biometricEnabled: boolean;
  hasBioWrap: boolean;
  pinEnabled: boolean;
  hasPinWrap: boolean;
};

export type ExtensionUnlockGate = {
  biometricAvailable: boolean;
  pinAvailable: boolean;
  initialMode: ExtensionUnlockMode;
};

/** Prefer biometrics when enabled and a PRF wrap record exists; then PIN; else master. */
export function resolveExtensionUnlockGate(input: ExtensionUnlockGateInput): ExtensionUnlockGate {
  const biometricAvailable = Boolean(input.biometricEnabled && input.hasBioWrap);
  const pinAvailable = Boolean(input.pinEnabled && input.hasPinWrap);
  let initialMode: ExtensionUnlockMode = "master";
  if (biometricAvailable) {
    initialMode = "biometric";
  } else if (pinAvailable) {
    initialMode = "pin";
  }
  return { biometricAvailable, pinAvailable, initialMode };
}

export function fallbackUnlockMode(pinAvailable: boolean): ExtensionUnlockMode {
  return pinAvailable ? "pin" : "master";
}

/**
 * Serializes biometric unlock attempts so React effect re-runs / Strict Mode
 * never issue a second WebAuthn call while one is still in flight for the same
 * unlock screen visit. A completed attempt must not auto-retry; the caller
 * switches mode away from biometric on failure.
 */
export function createBiometricUnlockAttemptGate<T>(
  unlock: () => Promise<T>,
): {
  runOnce: () => Promise<T | null>;
  reset: () => void;
  isInFlight: () => boolean;
  hasCompleted: () => boolean;
} {
  let inFlight: Promise<T | null> | null = null;
  let completed = false;

  return {
    isInFlight: () => inFlight != null,
    hasCompleted: () => completed,
    reset: () => {
      inFlight = null;
      completed = false;
    },
    runOnce: () => {
      if (completed) {
        return Promise.resolve(null);
      }
      if (inFlight) {
        return inFlight;
      }
      inFlight = (async () => {
        try {
          const result = await unlock();
          completed = true;
          return result;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
}
