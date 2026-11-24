import type { IncomingMessage } from "node:http";
import { getHeader } from "../http.ts";

/** Clients branch on this code when the server requires a newer app build. */
export const CLIENT_UPGRADE_REQUIRED = "CLIENT_UPGRADE_REQUIRED";
export const CLIENT_UPGRADE_REQUIRED_STATUS = 426;
export const CLIENT_UPGRADE_REQUIRED_MESSAGE =
  "This Okkey app is out of date. Update the app and try again.";

export const CLIENT_CAPABILITY_HEADER = "x-okkey-client-capabilities";
/** Sent by clients that can read an ML-DSA-65 identity bundle. */
export const MLDSA_IDENTITY_CAPABILITY = "mldsa-identity-v2";

export const MLDSA_IDENTITY_BUNDLE_IDENTITY = "ed25519_mlkem768_mldsa65_v2";
export const MLDSA_IDENTITY_BUNDLE_META_VERSION = 3;

export function requestSupportsMlDsaIdentity(req: IncomingMessage): boolean {
  const raw = getHeader(req, CLIENT_CAPABILITY_HEADER) ?? "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .includes(MLDSA_IDENTITY_CAPABILITY);
}

/** True when the stored identity blob uses the ML-DSA bundle layout. */
export function identityBundleRequiresCurrentClient(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) {
    return false;
  }
  if (meta.identity === MLDSA_IDENTITY_BUNDLE_IDENTITY) {
    return true;
  }
  const version = meta.bundle_version;
  return typeof version === "number" && version >= MLDSA_IDENTITY_BUNDLE_META_VERSION;
}
