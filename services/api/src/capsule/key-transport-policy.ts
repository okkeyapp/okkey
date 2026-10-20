/**
 * Q-Day #2 / q2-5 product decision (claim-reduce):
 * Capsule guest key delivery is OOB — URL fragment or explicit out_of_band —
 * and is **not** a hybrid ECC+PQ KEM hop. Do not add hybrid_* / mlkem modes
 * here without a product override and claim-map update (docs sync = q2-7).
 */
export type CapsuleKeyTransportMode = "fragment" | "out_of_band";

export const CAPSULE_GUEST_KEY_TRANSPORT_CLAIM = "oob_fragment_not_kem" as const;

export const CAPSULE_UNSAFE_KEY_TRANSPORT = "CAPSULE_UNSAFE_KEY_TRANSPORT";
export const CAPSULE_UNSAFE_KEY_TRANSPORT_STATUS_CODE = 400;
export const DEFAULT_CAPSULE_KEY_TRANSPORT_MODE: CapsuleKeyTransportMode = "out_of_band";

const SAFE_CAPSULE_KEY_TRANSPORT_MODES = new Set<CapsuleKeyTransportMode>([
  "fragment",
  "out_of_band",
]);

/** Modes that would imply hybrid-KEM guest delivery — always rejected. */
const REJECTED_HYBRID_CAPSULE_KEY_TRANSPORT_MODES = new Set([
  "hybrid",
  "hybrid_ecc_pq_v1",
  "hybrid_recipient",
  "hybrid_kem",
  "mlkem",
  "ml_kem",
  "ml-kem",
]);

export const CAPSULE_KEY_QUERY_PARAM_NAMES = new Set([
  "key",
  "k",
  "capsuleKey",
  "capsule_key",
  "transportKey",
  "transport_key",
]);

export function normalizeCapsuleKeyTransportMode(value: string | undefined): CapsuleKeyTransportMode {
  const mode = (value ?? DEFAULT_CAPSULE_KEY_TRANSPORT_MODE).trim();
  if (SAFE_CAPSULE_KEY_TRANSPORT_MODES.has(mode as CapsuleKeyTransportMode)) {
    return mode as CapsuleKeyTransportMode;
  }
  if (REJECTED_HYBRID_CAPSULE_KEY_TRANSPORT_MODES.has(mode.toLowerCase())) {
    throw new Error(
      "capsule guest key transport is OOB fragment / out_of_band, not hybrid KEM",
    );
  }
  throw new Error("unsafe key transport is not allowed; use fragment or out_of_band");
}

/** Allowed guest key transport modes for this release (q2-5 claim-reduce). */
export function listSafeCapsuleKeyTransportModes(): readonly CapsuleKeyTransportMode[] {
  return ["fragment", "out_of_band"];
}

export function hasUnsafeKeyTransportInUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }
  const parsed = new URL(rawUrl, "http://localhost");
  for (const key of parsed.searchParams.keys()) {
    if (CAPSULE_KEY_QUERY_PARAM_NAMES.has(key)) {
      return true;
    }
  }
  return false;
}
