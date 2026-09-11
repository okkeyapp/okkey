/**
 * WebAuthn-gated device biometric unlock.
 * Platform authenticator (Touch ID / Face ID / Windows Hello) gates access to a
 * locally stored wrap key that decrypts VaultKey + password share C.
 */
import {
  generateDeviceBioWrapKey,
  wrapUnlockMaterialWithBioKey,
  unwrapUnlockMaterialWithBioKey,
  wipeBytes,
} from "@okkey/crypto";

import { bytesToBase64, base64ToBytes } from "./base64";
import { readBioUnlockWrap, writeBioUnlockWrap } from "./vaultDeviceUnlockStore";

export type BiometricUnlockErrorCode =
  | "unsupported"
  | "insecure_context"
  | "unavailable"
  | "cancelled"
  | "timeout"
  | "security"
  | "invalid_state"
  | "missing_secret"
  | "crypto_failed"
  | "failed";

export type BiometricCapability =
  | { status: "ready" }
  | {
      status: "unsupported" | "insecure_context" | "unavailable";
      code: BiometricUnlockErrorCode;
    };

export type BiometricSetupResult = { ok: true } | { ok: false; code: BiometricUnlockErrorCode };

export type BiometricUnlockResult =
  | { ok: true; vaultKey: Uint8Array; passwordShareC: Uint8Array }
  | { ok: false; code: BiometricUnlockErrorCode };

/** i18n key under `web.settingsPopup.vault.biometric.error.*` / unlock fallbacks. */
export function biometricErrorMessageKey(code: BiometricUnlockErrorCode): string {
  switch (code) {
    case "unsupported":
      return "web.settingsPopup.vault.biometric.error.unsupported";
    case "insecure_context":
      return "web.settingsPopup.vault.biometric.error.insecureContext";
    case "unavailable":
      return "web.settingsPopup.vault.biometric.error.unavailable";
    case "cancelled":
      return "web.settingsPopup.vault.biometric.error.cancelled";
    case "timeout":
      return "web.settingsPopup.vault.biometric.error.timeout";
    case "security":
      return "web.settingsPopup.vault.biometric.error.security";
    case "invalid_state":
      return "web.settingsPopup.vault.biometric.error.invalidState";
    case "missing_secret":
      return "web.settingsPopup.vault.biometric.error.missingSecret";
    case "crypto_failed":
      return "web.settingsPopup.vault.biometric.error.cryptoFailed";
    case "failed":
    default:
      return "web.settingsPopup.vault.biometric.error.failed";
  }
}

export function mapWebAuthnError(error: unknown): BiometricUnlockErrorCode {
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
    case "NetworkError":
    case "UnknownError":
    default:
      return "failed";
  }
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out.buffer;
}

export async function getBiometricUnlockCapability(): Promise<BiometricCapability> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { status: "unsupported", code: "unsupported" };
  }
  if (!window.isSecureContext) {
    return { status: "insecure_context", code: "insecure_context" };
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

export async function setupBiometricUnlock(input: {
  userId: string;
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
}): Promise<BiometricSetupResult> {
  const capability = await getBiometricUnlockCapability();
  if (capability.status !== "ready") {
    return { ok: false, code: capability.code };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    // Fresh random user handle each setup avoids InvalidStateError when re-enrolling
    // the same discoverable credential user id on the platform authenticator.
    const webAuthnUserId = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Okkey", id: window.location.hostname },
        user: {
          id: webAuthnUserId,
          name: `okkey-vault-${input.userId}`,
          displayName: "Okkey vault unlock",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!credential) {
      return { ok: false, code: "cancelled" };
    }

    const wrapKey = await generateDeviceBioWrapKey();
    try {
      const ciphertextB64 = await wrapUnlockMaterialWithBioKey({
        vaultKey: input.vaultKey,
        passwordShareC: input.passwordShareC,
        bioWrapKey: wrapKey,
      });
      writeBioUnlockWrap(input.userId, {
        credentialIdB64: bufferToBase64Url(credential.rawId),
        ciphertextB64,
        wrapKeyB64: bytesToBase64(wrapKey),
      });
      return { ok: true };
    } catch {
      return { ok: false, code: "crypto_failed" };
    } finally {
      wipeBytes(wrapKey);
    }
  } catch (error) {
    return { ok: false, code: mapWebAuthnError(error) };
  }
}

export function disableBiometricUnlock(userId: string): void {
  writeBioUnlockWrap(userId, null);
}

export async function tryUnlockWithBiometrics(userId: string): Promise<BiometricUnlockResult> {
  const stored = readBioUnlockWrap(userId);
  if (!stored) {
    return { ok: false, code: "missing_secret" };
  }
  const capability = await getBiometricUnlockCapability();
  if (capability.status !== "ready") {
    return { ok: false, code: capability.code };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [
          {
            type: "public-key",
            id: base64UrlToBuffer(stored.credentialIdB64),
            transports: ["internal"],
          },
        ],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    if (!assertion) {
      return { ok: false, code: "cancelled" };
    }
    const wrapKey = base64ToBytes(stored.wrapKeyB64);
    try {
      const material = await unwrapUnlockMaterialWithBioKey({
        ciphertextB64: stored.ciphertextB64,
        bioWrapKey: wrapKey,
      });
      return { ok: true, vaultKey: material.vaultKey, passwordShareC: material.passwordShareC };
    } catch {
      return { ok: false, code: "crypto_failed" };
    } finally {
      wipeBytes(wrapKey);
    }
  } catch (error) {
    return { ok: false, code: mapWebAuthnError(error) };
  }
}
