/**
 * WebAuthn PRF-gated biometric unlock for the extension popup (MV3).
 * Wrap key is derived from `prf.results.first` and never written to chrome.storage.local.
 */
import {
  deriveBioWrapKeyFromPrf,
  generateBioPrfSalt,
  wrapUnlockMaterialWithBioKey,
  unwrapUnlockMaterialWithBioKey,
  wipeBytes,
} from "@okkey/crypto";

import {
  readExtensionBioUnlockWrap,
  writeExtensionBioUnlockWrap,
} from "./extensionDeviceUnlockStore.ts";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.trim());
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i) & 0xff;
  }
  return out;
}
export type BiometricUnlockErrorCode =
  | "unsupported"
  | "insecure_context"
  | "unavailable"
  | "prf_unavailable"
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

export function biometricErrorMessageKey(code: BiometricUnlockErrorCode): string {
  switch (code) {
    case "unsupported":
      return "web.settingsPopup.vault.biometric.error.unsupported";
    case "insecure_context":
      return "web.settingsPopup.vault.biometric.error.insecureContext";
    case "unavailable":
      return "web.settingsPopup.vault.biometric.error.unavailable";
    case "prf_unavailable":
      return "web.settingsPopup.vault.biometric.error.prfUnavailable";
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

function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(base64UrlToBuffer(value));
}

type PrfExtensionResults = {
  prf?: {
    enabled?: boolean;
    results?: { first?: unknown };
  };
};

/** Exported for unit tests. */
export function readPrfFirst(extensionResults: PrfExtensionResults): Uint8Array | null {
  const first = extensionResults.prf?.results?.first;
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

function prfEnabled(extensionResults: PrfExtensionResults): boolean {
  return extensionResults.prf?.enabled === true || Boolean(extensionResults.prf?.results?.first);
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

function extensionHostname(): string | undefined {
  return typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : undefined;
}

async function evaluatePrfForCredential(input: {
  credentialId: ArrayBuffer;
  salt: Uint8Array;
}): Promise<Uint8Array | null> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const hostname = extensionHostname();
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      ...(hostname ? { rpId: hostname } : {}),
      allowCredentials: [
        {
          type: "public-key",
          id: input.credentialId,
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      timeout: 60_000,
      extensions: {
        prf: {
          eval: {
            first: input.salt,
          },
        },
      },
    },
  })) as PublicKeyCredential | null;
  if (!assertion) {
    return null;
  }
  return readPrfFirst(assertion.getClientExtensionResults() as PrfExtensionResults);
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

  let salt: Uint8Array | null = null;
  let prfOutput: Uint8Array | null = null;
  let wrapKey: Uint8Array | null = null;
  try {
    salt = await generateBioPrfSalt();
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const webAuthnUserId = crypto.getRandomValues(new Uint8Array(32));
    const hostname = extensionHostname();
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
        extensions: {
          prf: {
            eval: {
              first: salt,
            },
          },
        },
      },
    })) as PublicKeyCredential | null;
    if (!credential) {
      return { ok: false, code: "cancelled" };
    }

    const createExt = credential.getClientExtensionResults() as PrfExtensionResults;
    prfOutput = readPrfFirst(createExt);
    if (!prfOutput) {
      if (!prfEnabled(createExt)) {
        return { ok: false, code: "prf_unavailable" };
      }
      try {
        prfOutput = await evaluatePrfForCredential({
          credentialId: credential.rawId,
          salt,
        });
      } catch (error) {
        return { ok: false, code: mapWebAuthnError(error) };
      }
    }
    if (!prfOutput) {
      return { ok: false, code: "prf_unavailable" };
    }

    wrapKey = await deriveBioWrapKeyFromPrf({ prfOutput, salt });
    try {
      const ciphertextB64 = await wrapUnlockMaterialWithBioKey({
        vaultKey: input.vaultKey,
        passwordShareC: input.passwordShareC,
        bioWrapKey: wrapKey,
      });
      await writeExtensionBioUnlockWrap(input.userId, {
        credentialIdB64: bufferToBase64Url(credential.rawId),
        ciphertextB64,
        prfSaltB64: bytesToBase64(salt),
      });
      return { ok: true };
    } catch {
      return { ok: false, code: "crypto_failed" };
    }
  } catch (error) {
    return { ok: false, code: mapWebAuthnError(error) };
  } finally {
    wipeBytes(salt);
    wipeBytes(prfOutput);
    wipeBytes(wrapKey);
  }
}

export async function disableExtensionBiometricUnlock(userId: string): Promise<void> {
  await writeExtensionBioUnlockWrap(userId, null);
}

export async function tryUnlockExtensionWithBiometrics(
  userId: string,
): Promise<BiometricUnlockResult> {
  const stored = await readExtensionBioUnlockWrap(userId);
  if (!stored) {
    return { ok: false, code: "missing_secret" };
  }
  const capability = await getExtensionBiometricUnlockCapability();
  if (capability.status !== "ready") {
    return { ok: false, code: capability.code };
  }

  let salt: Uint8Array | null = null;
  let prfOutput: Uint8Array | null = null;
  let wrapKey: Uint8Array | null = null;
  try {
    salt = base64ToBytes(stored.prfSaltB64);
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const hostname = extensionHostname();
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        ...(hostname ? { rpId: hostname } : {}),
        allowCredentials: [
          {
            type: "public-key",
            id: base64UrlToBuffer(stored.credentialIdB64),
            transports: ["internal"],
          },
        ],
        userVerification: "required",
        timeout: 60_000,
        extensions: {
          prf: {
            eval: {
              first: salt,
            },
          },
        },
      },
    })) as PublicKeyCredential | null;
    if (!assertion) {
      return { ok: false, code: "cancelled" };
    }
    prfOutput = readPrfFirst(assertion.getClientExtensionResults() as PrfExtensionResults);
    if (!prfOutput) {
      return { ok: false, code: "prf_unavailable" };
    }
    wrapKey = await deriveBioWrapKeyFromPrf({ prfOutput, salt });
    try {
      const material = await unwrapUnlockMaterialWithBioKey({
        ciphertextB64: stored.ciphertextB64,
        bioWrapKey: wrapKey,
      });
      return { ok: true, vaultKey: material.vaultKey, passwordShareC: material.passwordShareC };
    } catch {
      return { ok: false, code: "crypto_failed" };
    }
  } catch (error) {
    return { ok: false, code: mapWebAuthnError(error) };
  } finally {
    wipeBytes(salt);
    wipeBytes(prfOutput);
    wipeBytes(wrapKey);
  }
}
