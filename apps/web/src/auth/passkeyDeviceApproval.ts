/**
 * WebAuthn PRF wrap of share B, and the pending-device approval ceremony.
 * A missing PRF result stops the flow. The server is not asked to copy share B.
 */
import type { CoreApiClient } from "@okkey/api";
import { ApiRequestError } from "@okkey/api";
import {
  initCrypto,
  openPasskeyShareWrap,
  sealPasskeyShareWrap,
  wipeBytes,
} from "@okkey/crypto";
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
  | "cancelled"
  | "rate_limited"
  | "replay"
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
  if (error.body.error === "PASSKEY_SHARE_WRAP_MISSING") {
    return "no_wrap";
  }
  return "failed";
}

export async function establishPasskeyShareWrap(
  core: CoreApiClient,
  input: { credentialRowId: string; deviceShare: Uint8Array },
): Promise<{ ok: true } | { ok: false; code: PasskeyWrapErrorCode }> {
  if (input.deviceShare.length === 0) {
    return { ok: false, code: "needs_unlock" };
  }
  let prfOutput: Uint8Array | null = null;
  const shareCopy = input.deviceShare.slice();
  try {
    await initCrypto();
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
      deviceShare: shareCopy,
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
    if (mapped === "no_wrap") {
      return { ok: false, code: "failed" };
    }
    return { ok: false, code: mapped ?? "failed" };
  } finally {
    wipeBytes(prfOutput);
    wipeBytes(shareCopy);
  }
}

export async function approvePendingDeviceWithPasskey(
  core: CoreApiClient,
  deviceId: string,
): Promise<{ ok: true } | { ok: false; code: PasskeyApprovalErrorCode }> {
  let prfOutput: Uint8Array | null = null;
  let share: Uint8Array | null = null;
  try {
    await initCrypto();
    const options = await core.passkeyApprovalOptions(deviceId);
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
    const wrapped = options.credentials.find(
      (credential) => credential.credential_id === assertion.id,
    );
    if (!wrapped) {
      return { ok: false, code: "failed" };
    }
    share = await openPasskeyShareWrap({
      wrap: base64ToBytes(wrapped.share_wrap),
      prfOutput,
      salt: base64ToBytes(wrapped.share_wrap_salt),
      credentialId: assertion.id,
    });
    await core.passkeyApprovalVerify(deviceId, {
      challengeId: options.challengeId,
      response: assertion as unknown as Record<string, unknown>,
      device_share: bytesToBase64(share),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapApiError(error) ?? "failed" };
  } finally {
    wipeBytes(prfOutput);
    wipeBytes(share);
  }
}
