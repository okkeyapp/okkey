/**
 * Local device unlock secrets (PIN / biometric wraps). Never sent to the server.
 */
import type { PinUnlockWrap } from "@okkey/crypto";

export type StoredPinUnlock = PinUnlockWrap;

export type StoredBioUnlock = {
  /** Credential id from WebAuthn (base64url). */
  credentialIdB64: string;
  /** AEAD ciphertext wrapping VaultKey+C under a PRF-derived bio wrap key. */
  ciphertextB64: string;
  /**
   * Random salt used as WebAuthn PRF `eval.first` input.
   * The wrap key is derived from `prf.results.first` and is never stored.
   */
  prfSaltB64: string;
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

function isLegacyBioRecord(bio: Record<string, unknown>): boolean {
  return typeof bio.wrapKeyB64 === "string" && bio.wrapKeyB64.trim().length > 0;
}

function parseValidBio(bio: unknown): StoredBioUnlock | null {
  if (!bio || typeof bio !== "object") {
    return null;
  }
  const record = bio as Record<string, unknown>;
  // Legacy records stored the wrap key in clear text — never accept them.
  if (isLegacyBioRecord(record)) {
    return null;
  }
  if (
    typeof record.credentialIdB64 !== "string" ||
    typeof record.ciphertextB64 !== "string" ||
    typeof record.prfSaltB64 !== "string"
  ) {
    return null;
  }
  if (
    !record.credentialIdB64.trim() ||
    !record.ciphertextB64.trim() ||
    !record.prfSaltB64.trim()
  ) {
    return null;
  }
  // Refuse any leftover key-material field names.
  for (const key of Object.keys(record)) {
    if (/wrapKey|secretKey|bioKey|rawKey/i.test(key)) {
      return null;
    }
  }
  return {
    credentialIdB64: record.credentialIdB64,
    ciphertextB64: record.ciphertextB64,
    prfSaltB64: record.prfSaltB64,
  };
}

function parseStore(raw: string | null): {
  store: DeviceUnlockStore;
  wipedLegacyBio: boolean;
} {
  if (!raw) {
    return { store: emptyStore(), wipedLegacyBio: false };
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const pin =
      o.pin && typeof o.pin === "object" ? (o.pin as StoredPinUnlock) : null;
    const rawBio = o.bio && typeof o.bio === "object" ? (o.bio as Record<string, unknown>) : null;
    const wipedLegacyBio = Boolean(rawBio && isLegacyBioRecord(rawBio));
    const bio = parseValidBio(rawBio);
    return {
      store: {
        pin:
          pin && typeof pin.kdfSaltB64 === "string" && typeof pin.ciphertextB64 === "string"
            ? pin
            : null,
        bio,
      },
      wipedLegacyBio: wipedLegacyBio || (Boolean(rawBio) && bio === null),
    };
  } catch {
    return { store: emptyStore(), wipedLegacyBio: false };
  }
}

function readStore(userId: string): { store: DeviceUnlockStore; wipedLegacyBio: boolean } {
  if (typeof localStorage === "undefined") {
    return { store: emptyStore(), wipedLegacyBio: false };
  }
  try {
    const parsed = parseStore(localStorage.getItem(storeKey(userId)));
    // Persist the wipe so legacy wrapKeyB64 cannot be reused after reload.
    if (parsed.wipedLegacyBio) {
      writeStore(userId, parsed.store);
    }
    return parsed;
  } catch {
    return { store: emptyStore(), wipedLegacyBio: false };
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
  return readStore(userId).store.pin;
}

export function writePinUnlockWrap(userId: string, wrap: StoredPinUnlock | null): void {
  const { store } = readStore(userId);
  store.pin = wrap;
  writeStore(userId, store);
}

export function readBioUnlockWrap(userId: string): StoredBioUnlock | null {
  return readStore(userId).store.bio;
}

/**
 * Load bio wrap and report whether a legacy/invalid bio record was wiped.
 * Prefer this when reconciling the biometricEnabled preference.
 */
export function loadBioUnlockWrap(userId: string): {
  wrap: StoredBioUnlock | null;
  wipedLegacyBio: boolean;
} {
  const { store, wipedLegacyBio } = readStore(userId);
  return { wrap: store.bio, wipedLegacyBio };
}

export function writeBioUnlockWrap(userId: string, wrap: StoredBioUnlock | null): void {
  const { store } = readStore(userId);
  if (wrap) {
    // Defense in depth: persist only non-secret fields (never a wrap key).
    store.bio = {
      credentialIdB64: wrap.credentialIdB64,
      ciphertextB64: wrap.ciphertextB64,
      prfSaltB64: wrap.prfSaltB64,
    };
  } else {
    store.bio = null;
  }
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

/** Serialize shape used in unit tests — must not include wrap key fields. */
export function bioUnlockPersistedFields(wrap: StoredBioUnlock): string[] {
  return Object.keys(wrap).sort();
}
