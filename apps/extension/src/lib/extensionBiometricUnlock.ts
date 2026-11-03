/**
 * WebAuthn-gated biometric unlock for the extension popup (MV3).
 * Uses chrome.storage.local for wrap material (device-only).
 */
import {
  generateDeviceBioWrapKey,
  wrapUnlockMaterialWithBioKey,
  wipeBytes,
} from "@okkey/crypto";
import { bytesToBase64 } from "@okkey/vault";

import {
  writeExtensionBioUnlockWrap,
} from "./extensionDeviceUnlockStore";

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

function mapWebAuthnError(error: unknown): BiometricUnlockErrorCode {
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

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export async function getExtensionBiometricUnlockCapability(): Promise<BiometricCapability> {
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

export async function setupExtensionBiometricUnlock(input: {
  userId: string;
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
}): Promise<BiometricSetupResult> {
  const capability = await getExtensionBiometricUnlockCapability();
  if (capability.status !== "ready") {
    return { ok: false, code: capability.code };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const webAuthnUserId = crypto.getRandomValues(new Uint8Array(32));
    const hostname =
      typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : undefined;
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Okkey", ...(hostname ? { id: hostname } : {}) },
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
      await writeExtensionBioUnlockWrap(input.userId, {
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

export async function disableExtensionBiometricUnlock(userId: string): Promise<void> {
  await writeExtensionBioUnlockWrap(userId, null);
}
