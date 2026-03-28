export type CapsuleKeyTransportMode = "fragment" | "out_of_band";

export const CAPSULE_UNSAFE_KEY_TRANSPORT = "CAPSULE_UNSAFE_KEY_TRANSPORT";
export const CAPSULE_UNSAFE_KEY_TRANSPORT_STATUS_CODE = 400;
export const DEFAULT_CAPSULE_KEY_TRANSPORT_MODE: CapsuleKeyTransportMode = "out_of_band";

const SAFE_CAPSULE_KEY_TRANSPORT_MODES = new Set<CapsuleKeyTransportMode>([
  "fragment",
  "out_of_band",
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
  throw new Error("unsafe key transport is not allowed; use fragment or out_of_band");
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
