/**
 * Capsule guest key delivery.
 *
 * Active modes are still the URL fragment and explicit out_of_band.
 * Hybrid X25519+ML-KEM delivery is an extension point and is not selected:
 * anonymous guests have no identity key, and the product has not chosen
 * between an ephemeral recipient and a logged-in recipient.
 * Legacy `#key=` fragments remain the reader.
 */
export type CapsuleKeyTransportMode = "fragment" | "out_of_band";

/** Legacy fragment stays the active delivery. Hybrid recipient choice is open. */
export const CAPSULE_GUEST_KEY_TRANSPORT_CLAIM = "legacy_fragment_hybrid_undecided" as const;

export const CAPSULE_GUEST_KEY_HYBRID_RECIPIENT = "undecided" as const;

export const CAPSULE_UNSAFE_KEY_TRANSPORT = "CAPSULE_UNSAFE_KEY_TRANSPORT";
export const CAPSULE_UNSAFE_KEY_TRANSPORT_STATUS_CODE = 400;
export const DEFAULT_CAPSULE_KEY_TRANSPORT_MODE: CapsuleKeyTransportMode = "out_of_band";

const SAFE_CAPSULE_KEY_TRANSPORT_MODES = new Set<CapsuleKeyTransportMode>([
  "fragment",
  "out_of_band",
]);

/** Hybrid guest delivery is recognized and not active until a recipient is chosen. */
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
      "capsule guest hybrid delivery is not selected; use fragment or out_of_band",
    );
  }
  throw new Error("unsafe key transport is not allowed; use fragment or out_of_band");
}

/** Active guest key transport modes. Hybrid delivery is not one of them yet. */
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
