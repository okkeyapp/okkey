/**
 * Capability checks and error mapping for account login WebAuthn
 * (passkeys / hardware keys) — separate from vault biometric unlock.
 */
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type { WebAuthnAuthenticatorAttachment } from "@okkey/types";
import { ApiRequestError } from "@okkey/api";

export type AccountWebAuthnErrorCode =
  | "unsupported"
  | "insecure_context"
  | "unavailable"
  | "cancelled"
  | "timeout"
  | "security"
  | "invalid_state"
  | "server"
  | "failed";

export type AccountWebAuthnCapability =
  | { status: "ready" }
  | {
      status: "unsupported" | "insecure_context" | "unavailable";
      code: AccountWebAuthnErrorCode;
    };

export function accountWebAuthnErrorMessageKey(code: AccountWebAuthnErrorCode): string {
  switch (code) {
    case "unsupported":
      return "web.settingsLogin.webauthn.error.unsupported";
    case "insecure_context":
      return "web.settingsLogin.webauthn.error.insecureContext";
    case "unavailable":
      return "web.settingsLogin.webauthn.error.unavailable";
    case "cancelled":
      return "web.settingsLogin.webauthn.error.cancelled";
    case "timeout":
      return "web.settingsLogin.webauthn.error.timeout";
    case "security":
      return "web.settingsLogin.webauthn.error.security";
    case "invalid_state":
      return "web.settingsLogin.webauthn.error.invalidState";
    case "server":
      return "web.settingsLogin.webauthn.error.server";
    case "failed":
    default:
      return "web.settingsLogin.webauthn.error.failed";
  }
}

export function mapAccountWebAuthnError(error: unknown): AccountWebAuthnErrorCode {
  if (error instanceof ApiRequestError) {
    const code = error.body.error;
    if (
      code === "WEBAUTHN_VERIFICATION_FAILED" ||
      code === "WEBAUTHN_CHALLENGE_EXPIRED" ||
      code === "WEBAUTHN_CHALLENGE_INVALID" ||
      code === "WEBAUTHN_CREDENTIAL_EXISTS" ||
      code === "WEBAUTHN_NO_CREDENTIALS" ||
      code === "WEBAUTHN_CREDENTIAL_NOT_FOUND" ||
      code === "AUTH_BAD_REQUEST" ||
      code === "INTERNAL_SERVER_ERROR"
    ) {
      return "server";
    }
    return "server";
  }
  if (!error || typeof error !== "object") {
    return "failed";
  }
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "AbortError":
      return "cancelled";
    case "TimeoutError":
      return "timeout";
    case "SecurityError":
      return "security";
    case "InvalidStateError":
      return "invalid_state";
    case "NotSupportedError":
      return "unsupported";
    default:
      return "failed";
  }
}

async function baseWebAuthnCapability(): Promise<AccountWebAuthnCapability> {
  if (typeof window === "undefined" || !browserSupportsWebAuthn()) {
    return { status: "unsupported", code: "unsupported" };
  }
  if (!window.isSecureContext) {
    return { status: "insecure_context", code: "insecure_context" };
  }
  return { status: "ready" };
}

/** Passkeys: platform authenticator (Touch ID / Face ID / Windows Hello). */
export async function getPasskeyLoginCapability(): Promise<AccountWebAuthnCapability> {
  const base = await baseWebAuthnCapability();
  if (base.status !== "ready") {
    return base;
  }
  try {
    const probe = PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof probe !== "function") {
      return { status: "unavailable", code: "unavailable" };
    }
    const available = await probe.call(PublicKeyCredential);
    if (!available) {
      return { status: "unavailable", code: "unavailable" };
    }
  } catch {
    return { status: "unavailable", code: "unavailable" };
  }
  return { status: "ready" };
}

/**
 * Hardware / roaming authenticators (USB, NFC, BLE).
 * Only requires WebAuthn + secure context — the key itself is probed at enroll time.
 */
export async function getHardwareKeyLoginCapability(): Promise<AccountWebAuthnCapability> {
  return baseWebAuthnCapability();
}

export async function getAccountWebAuthnCapability(
  attachment: WebAuthnAuthenticatorAttachment,
): Promise<AccountWebAuthnCapability> {
  return attachment === "platform"
    ? getPasskeyLoginCapability()
    : getHardwareKeyLoginCapability();
}
