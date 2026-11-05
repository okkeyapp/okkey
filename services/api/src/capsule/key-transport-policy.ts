/**
 * Capsule guest key delivery.
 *
 * The API accepts only `fragment` and `out_of_band`. New guest links carry a
 * one-time ephemeral hybrid recipient inside that fragment. A legacy raw
 * `#key=` value still unwraps on read. `hybrid_*` is not an API transport mode.
 */
export type CapsuleKeyTransportMode = "fragment" | "out_of_band";

/** New links use an ephemeral recipient inside the fragment. Legacy `#key=` still reads. */
export const CAPSULE_GUEST_KEY_TRANSPORT_CLAIM = "ephemeral_recipient_fragment" as const;

export const CAPSULE_GUEST_KEY_HYBRID_RECIPIENT = "ephemeral_v1" as const;

export const CAPSULE_UNSAFE_KEY_TRANSPORT = "CAPSULE_UNSAFE_KEY_TRANSPORT";
export const CAPSULE_UNSAFE_KEY_TRANSPORT_STATUS_CODE = 400;
export const DEFAULT_CAPSULE_KEY_TRANSPORT_MODE: CapsuleKeyTransportMode = "out_of_band";

const SAFE_CAPSULE_KEY_TRANSPORT_MODES = new Set<CapsuleKeyTransportMode>([
  "fragment",
  "out_of_band",
]);

/** Not an API transport mode. Guest hybrid material stays in the fragment. */
const HYBRID_CAPSULE_KEY_TRANSPORT_NOT_SELECTED = new Set([
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
  if (HYBRID_CAPSULE_KEY_TRANSPORT_NOT_SELECTED.has(mode.toLowerCase())) {
    throw new Error(
      "guest hybrid material belongs in the link fragment; use fragment or out_of_band",
    );
  }
  throw new Error("unsafe key transport is not allowed; use fragment or out_of_band");
}

/** API transport modes. Hybrid guest material is inside the fragment, not a mode. */
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
