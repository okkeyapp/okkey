/**
 * Local device unlock secrets (PIN / biometric wraps). Never sent to the server.
 */
import type { PinUnlockWrap } from "@okkey/crypto";

export type StoredPinUnlock = PinUnlockWrap;

export type StoredBioUnlock = {
  /** Credential id from WebAuthn (base64url). */
  credentialIdB64: string;
  /** AEAD ciphertext wrapping VaultKey+C under bio wrap key. */
  ciphertextB64: string;
  /**
   * Bio wrap key stored locally when WebAuthn PRF is unavailable.
   * Protected only by WebAuthn user verification gate before use.
   */
  wrapKeyB64: string;
};

type DeviceUnlockStore = {
  pin: StoredPinUnlock | null;
  bio: StoredBioUnlock | null;
};

function storeKey(userId: string): string {
  return `okkey.vault.deviceUnlock.v1.u.${userId}`;
}

function emptyStore(): DeviceUnlockStore {
  return { pin: null, bio: null };
}

function parseStore(raw: string | null): DeviceUnlockStore {
  if (!raw) {
    return emptyStore();
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const pin =
      o.pin && typeof o.pin === "object"
        ? (o.pin as StoredPinUnlock)
        : null;
    const bio =
      o.bio && typeof o.bio === "object"
        ? (o.bio as StoredBioUnlock)
        : null;
    return {
      pin:
        pin && typeof pin.kdfSaltB64 === "string" && typeof pin.ciphertextB64 === "string"
          ? pin
          : null,
      bio:
        bio &&
        typeof bio.credentialIdB64 === "string" &&
        typeof bio.ciphertextB64 === "string" &&
        typeof bio.wrapKeyB64 === "string"
          ? bio
          : null,
    };
  } catch {
    return emptyStore();
  }
}

function readStore(userId: string): DeviceUnlockStore {
  if (typeof localStorage === "undefined") {
    return emptyStore();
  }
  try {
    return parseStore(localStorage.getItem(storeKey(userId)));
  } catch {
    return emptyStore();
  }
}

function writeStore(userId: string, store: DeviceUnlockStore): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function readPinUnlockWrap(userId: string): StoredPinUnlock | null {
  return readStore(userId).pin;
}

export function writePinUnlockWrap(userId: string, wrap: StoredPinUnlock | null): void {
  const store = readStore(userId);
  store.pin = wrap;
  writeStore(userId, store);
}

export function readBioUnlockWrap(userId: string): StoredBioUnlock | null {
  return readStore(userId).bio;
}

export function writeBioUnlockWrap(userId: string, wrap: StoredBioUnlock | null): void {
  const store = readStore(userId);
  store.bio = wrap;
  writeStore(userId, store);
}

export function clearDeviceUnlockSecrets(userId: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(storeKey(userId));
  } catch {
    /* ignore */
  }
}
