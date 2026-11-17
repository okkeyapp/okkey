/**
 * WebAuthn PRF wrap of share B, and the pending-device approval ceremony.
 * A missing PRF result stops the flow. The server is not asked to copy share B.
 *
 * The PRF wrap must contain the raw 32-byte share B. On approve, the client
 * re-wraps that share for the pending device's wrap public keys before upload.
 */
import {
  ApiRequestError,
  postPasskeyHandoffOptions,
  postPasskeyHandoffReject,
  postPasskeyHandoffVerify,
  type ApiClient,
  type CoreApiClient,
} from "@okkey/api";
import {
  classifySplitKeyShareBWire,
  initCrypto,
  openPasskeyShareWrap,
  openStoredSplitKeyShareB,
  sealPasskeyShareWrap,
  wipeBytes,
  wrapSplitKeyShareB,
} from "@okkey/crypto";
import { loadSplitKeyShareWrapKey } from "@okkey/vault";
import {
  startAuthentication,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { base64ToBytes, bytesToBase64 } from "./base64";

export type PasskeyWrapErrorCode =
  | "prf_unavailable"
  | "needs_unlock"
  | "cancelled"
  | "rate_limited"
  | "replay"
  | "failed";

export type PasskeyApprovalErrorCode =
  | "prf_unavailable"
  | "no_wrap"
  | "wrap_outdated"
  | "cancelled"
  | "rate_limited"
  | "replay"
  | "expired"
  | "failed";

export function passkeyWrapErrorMessageKey(code: PasskeyWrapErrorCode): string {
  return `web.settingsLogin.passkeyWrap.${code}`;
}

export function passkeyApprovalErrorMessageKey(code: PasskeyApprovalErrorCode): string {
  return `web.devicePending.passkey.${code}`;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return base64ToBytes(padded + pad);
}

function readPrfFirst(assertion: AuthenticationResponseJSON): Uint8Array | null {
  const extensions = assertion.clientExtensionResults as {
    prf?: { results?: { first?: unknown } };
  };
  const first = extensions.prf?.results?.first;
  if (typeof first === "string" && first.trim()) {
    try {
      const bytes = base64UrlToBytes(first.trim());
      return bytes.length === 32 ? bytes : null;
    } catch {
      return null;
    }
  }
  if (first instanceof ArrayBuffer) {
    const bytes = new Uint8Array(first);
    return bytes.length === 32 ? bytes : null;
  }
  if (ArrayBuffer.isView(first)) {
    const view = first as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return bytes.length === 32 ? bytes.slice() : null;
  }
  return null;
}

function withPrfExtension(
  options: Record<string, unknown>,
  salt: Uint8Array,
): PublicKeyCredentialRequestOptionsJSON {
  const extensions =
    options.extensions && typeof options.extensions === "object"
      ? { ...(options.extensions as Record<string, unknown>) }
      : {};
  // `navigator.credentials.get` wants a BufferSource. @simplewebauthn/browser
  // forwards `extensions` unchanged, so the salt must already be bytes.
  return {
    ...options,
    userVerification: "required",
    extensions: {
      ...extensions,
      prf: {
        eval: {
          first: salt,
        },
      },
    },
  } as unknown as PublicKeyCredentialRequestOptionsJSON;
}

function mapCeremonyError(error: unknown): "cancelled" | "failed" {
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name: unknown }).name);
    if (name === "NotAllowedError" || name === "AbortError") {
      return "cancelled";
    }
  }
  return "failed";
}

function mapApiError(error: unknown): PasskeyApprovalErrorCode | null {
  if (!(error instanceof ApiRequestError)) {
    return null;
  }
  if (error.status === 429 || error.body.error === "PASSKEY_APPROVAL_RATE_LIMITED") {
    return "rate_limited";
  }
  if (
    error.body.error === "PASSKEY_APPROVAL_REPLAY" ||
    error.body.error === "PASSKEY_APPROVAL_CHALLENGE_EXPIRED"
  ) {
    return "replay";
  }
  if (error.status === 410 || error.body.error === "PASSKEY_HANDOFF_EXPIRED") {
    return "expired";
  }
  if (error.body.error === "PASSKEY_SHARE_WRAP_MISSING") {
    return "no_wrap";
  }
  return "failed";
}

async function openLocalRawShareB(
  userId: string,
  deviceShare: Uint8Array,
): Promise<Uint8Array> {
  const keys = await loadSplitKeyShareWrapKey(userId);
  return openStoredSplitKeyShareB({
    stored: deviceShare,
    recipientEd25519Seed: keys?.ed25519Seed,
    recipientMlkemDecapsulationKey: keys?.mlkemDecapsulationKey,
  });
}

async function wrapRawShareForPending(input: {
  rawShare: Uint8Array;
  ed25519PublicKeyB64: string | null | undefined;
  pqPublicKeyB64: string | null | undefined;
}): Promise<Uint8Array | null> {
  const ed = input.ed25519PublicKeyB64?.trim() ?? "";
  const pq = input.pqPublicKeyB64?.trim() ?? "";
  if (!ed || !pq) {
    return null;
  }
  if (classifySplitKeyShareBWire(input.rawShare) !== "legacy") {
    return null;
  }
  return wrapSplitKeyShareB({
    share: input.rawShare,
    recipientEd25519PublicKey: base64ToBytes(ed),
    recipientMlkemEncapsulationKey: base64ToBytes(pq),
  });
}

export async function establishPasskeyShareWrap(
  core: CoreApiClient,
  input: { credentialRowId: string; deviceShare: Uint8Array; userId: string },
): Promise<{ ok: true } | { ok: false; code: PasskeyWrapErrorCode }> {
  if (input.deviceShare.length === 0 || !input.userId.trim()) {
    return { ok: false, code: "needs_unlock" };
  }
  let prfOutput: Uint8Array | null = null;
  let rawShare: Uint8Array | null = null;
  try {
    await initCrypto();
    rawShare = await openLocalRawShareB(input.userId, input.deviceShare);
    if (classifySplitKeyShareBWire(rawShare) !== "legacy") {
      return { ok: false, code: "failed" };
    }
    const options = await core.passkeyShareWrapOptions(input.credentialRowId);
    const salt = base64ToBytes(options.prf_salt);
    let assertion: AuthenticationResponseJSON;
    try {
      assertion = await startAuthentication({
        optionsJSON: withPrfExtension(options.options, salt),
      });
    } catch (error) {
      return { ok: false, code: mapCeremonyError(error) };
    }
    prfOutput = readPrfFirst(assertion);
    if (!prfOutput) {
      return { ok: false, code: "prf_unavailable" };
    }
    const wrap = await sealPasskeyShareWrap({
      deviceShare: rawShare,
      prfOutput,
      salt,
      credentialId: options.credential_id,
    });
    await core.passkeyShareWrapVerify(input.credentialRowId, {
      challengeId: options.challengeId,
      response: assertion as unknown as Record<string, unknown>,
      share_wrap: bytesToBase64(wrap),
    });
    return { ok: true };
  } catch (error) {
    const mapped = mapApiError(error);
    if (mapped === "no_wrap" || mapped === "expired" || mapped === "wrap_outdated" || mapped === null) {
      return { ok: false, code: "failed" };
    }
    return { ok: false, code: mapped };
  } finally {
    wipeBytes(prfOutput);
    wipeBytes(rawShare);
  }
}

async function finishPasskeyApproval(input: {
  options: {
    challengeId: string;
    options: Record<string, unknown>;
    prf_salt: string;
    credentials: Array<{
      credential_id: string;
      share_wrap: string;
      share_wrap_salt: string;
    }>;
    share_wrap_ed25519_public_key: string | null;
    share_wrap_pq_public_key: string | null;
  };
  verify: (body: {
    challengeId: string;
    response: Record<string, unknown>;
    device_share: string;
  }) => Promise<unknown>;
}): Promise<{ ok: true } | { ok: false; code: PasskeyApprovalErrorCode }> {
  let prfOutput: Uint8Array | null = null;
  let rawShare: Uint8Array | null = null;
  let forPending: Uint8Array | null = null;
  try {
    await initCrypto();
    const salt = base64ToBytes(input.options.prf_salt);
    let assertion: AuthenticationResponseJSON;
    try {
      assertion = await startAuthentication({
        optionsJSON: withPrfExtension(input.options.options, salt),
      });
    } catch (error) {
      return { ok: false, code: mapCeremonyError(error) };
    }
    prfOutput = readPrfFirst(assertion);
    if (!prfOutput) {
      return { ok: false, code: "prf_unavailable" };
    }
    const wrapped = input.options.credentials.find(
      (credential) => credential.credential_id === assertion.id,
    );
    if (!wrapped) {
      return { ok: false, code: "failed" };
    }
    rawShare = await openPasskeyShareWrap({
      wrap: base64ToBytes(wrapped.share_wrap),
      prfOutput,
      salt: base64ToBytes(wrapped.share_wrap_salt),
      credentialId: assertion.id,
    });
    if (classifySplitKeyShareBWire(rawShare) !== "legacy") {
      // Older wraps sealed the approver's hybrid frame. Re-allow the passkey.
      return { ok: false, code: "wrap_outdated" };
    }
    forPending = await wrapRawShareForPending({
      rawShare,
      ed25519PublicKeyB64: input.options.share_wrap_ed25519_public_key,
      pqPublicKeyB64: input.options.share_wrap_pq_public_key,
    });
    if (!forPending) {
      return { ok: false, code: "failed" };
    }
    await input.verify({
      challengeId: input.options.challengeId,
      response: assertion as unknown as Record<string, unknown>,
      device_share: bytesToBase64(forPending),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapApiError(error) ?? "failed" };
  } finally {
    wipeBytes(prfOutput);
    wipeBytes(rawShare);
    wipeBytes(forPending);
  }
}

export async function approvePendingDeviceWithPasskey(
  core: CoreApiClient,
  deviceId: string,
): Promise<{ ok: true } | { ok: false; code: PasskeyApprovalErrorCode }> {
  try {
    const options = await core.passkeyApprovalOptions(deviceId);
    return finishPasskeyApproval({
      options,
      verify: (body) => core.passkeyApprovalVerify(deviceId, body),
    });
  } catch (error) {
    return { ok: false, code: mapApiError(error) ?? "failed" };
  }
}

/** Web tab opened by the extension. WebAuthn runs on the website origin; the request id is the secret. */
export async function completePasskeyHandoff(
  api: ApiClient,
  requestId: string,
): Promise<{ ok: true } | { ok: false; code: PasskeyApprovalErrorCode }> {
  try {
    const options = await postPasskeyHandoffOptions(api, requestId);
    return finishPasskeyApproval({
      options,
      verify: (body) => postPasskeyHandoffVerify(api, requestId, body),
    });
  } catch (error) {
    return { ok: false, code: mapApiError(error) ?? "failed" };
  }
}

export async function rejectPasskeyHandoff(api: ApiClient, requestId: string): Promise<void> {
  await postPasskeyHandoffReject(api, requestId);
}

/** Exported for unit tests: raw share under PRF must be re-wrapped for the pending device. */
export async function deviceShareB64ForPasskeyApproval(input: {
  rawShare: Uint8Array;
  shareWrapEd25519PublicKeyB64: string;
  shareWrapPqPublicKeyB64: string;
}): Promise<string> {
  const wrapped = await wrapRawShareForPending({
    rawShare: input.rawShare,
    ed25519PublicKeyB64: input.shareWrapEd25519PublicKeyB64,
    pqPublicKeyB64: input.shareWrapPqPublicKeyB64,
  });
  if (!wrapped) {
    throw new Error("pending device wrap keys are required");
  }
  try {
    return bytesToBase64(wrapped);
  } finally {
    wipeBytes(wrapped);
  }
}
