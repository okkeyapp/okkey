/** Legacy random hex fingerprints (pre structured id). */
const LEGACY_HEX_FINGERPRINT = /^[a-f0-9]{32,128}$/i;

/** True when `value` is a legacy random hex device fingerprint. */
export function isLegacyHexFingerprint(value: string): boolean {
  return LEGACY_HEX_FINGERPRINT.test(value.trim());
}

export interface SoleTrustedReclaimInput {
  storedFingerprint: string;
  storedClientType?: string | null;
  nextFingerprint: string;
  nextClientType: string;
}

/**
 * Whether a sole trusted device may be rebound to a new fingerprint.
 * The stored fingerprint must be legacy hex and must differ from the next one.
 * A known client type other than `web` or `unknown` must match the next client type.
 */
export function canReclaimSoleTrustedDevice(input: SoleTrustedReclaimInput): boolean {
  const oldFp = input.storedFingerprint.trim().toLowerCase();
  const nextFp = input.nextFingerprint.trim().toLowerCase();
  if (oldFp === nextFp) {
    return false;
  }
  if (!isLegacyHexFingerprint(oldFp)) {
    return false;
  }
  const soleClient = (input.storedClientType ?? "").trim().toLowerCase();
  if (
    soleClient &&
    soleClient !== "unknown" &&
    soleClient !== "web" &&
    soleClient !== input.nextClientType.trim().toLowerCase()
  ) {
    return false;
  }
  return true;
}
