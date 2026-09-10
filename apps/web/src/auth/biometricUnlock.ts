/**
 * WebAuthn-gated device biometric unlock.
 * Uses a local wrap key unlocked only after successful platform authenticator assertion.
 */
import {
  generateDeviceBioWrapKey,
  wrapUnlockMaterialWithBioKey,
  unwrapUnlockMaterialWithBioKey,
  wipeBytes,
} from "@okkey/crypto";

import { bytesToBase64, base64ToBytes } from "./base64";
import { readBioUnlockWrap, writeBioUnlockWrap } from "./vaultDeviceUnlockStore";

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

export async function setupBiometricUnlock(input: {
  userId: string;
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
}): Promise<{ ok: true } | { ok: false }> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { ok: false };
  }
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBytes = new TextEncoder().encode(input.userId);
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Okkey", id: window.location.hostname },
        user: {
          id: userIdBytes,
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
      return { ok: false };
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
    } finally {
      wipeBytes(wrapKey);
    }
  } catch {
    return { ok: false };
  }
}

export function disableBiometricUnlock(userId: string): void {
  writeBioUnlockWrap(userId, null);
}

export async function tryUnlockWithBiometrics(userId: string): Promise<{
  vaultKey: Uint8Array;
  passwordShareC: Uint8Array;
} | null> {
  const stored = readBioUnlockWrap(userId);
  if (!stored || typeof window === "undefined" || !window.PublicKeyCredential) {
    return null;
  }
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
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
      return null;
    }
    const wrapKey = base64ToBytes(stored.wrapKeyB64);
    try {
      return await unwrapUnlockMaterialWithBioKey({
        ciphertextB64: stored.ciphertextB64,
        bioWrapKey: wrapKey,
      });
    } finally {
      wipeBytes(wrapKey);
    }
  } catch {
    return null;
  }
}
