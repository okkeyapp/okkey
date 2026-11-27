/**
 * Extension device unlock secrets (PIN / biometric wraps) in chrome.storage.local.
 * Never sent to the server; never synced across devices.
 */
import type { PinUnlockWrap } from "@okkey/crypto";

export type StoredPinUnlock = PinUnlockWrap;

export type StoredBioUnlock = {
  credentialIdB64: string;
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
    const pin = o.pin && typeof o.pin === "object" ? (o.pin as StoredPinUnlock) : null;
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

async function readStore(userId: string): Promise<{
  store: DeviceUnlockStore;
  wipedLegacyBio: boolean;
}> {
  try {
    const bag = await browser.storage.local.get(storeKey(userId));
    const raw = bag[storeKey(userId)];
    const parsed = parseStore(typeof raw === "string" ? raw : null);
    if (parsed.wipedLegacyBio) {
      await writeStore(userId, parsed.store);
    }
    return parsed;
  } catch {
    return { store: emptyStore(), wipedLegacyBio: false };
  }
}

async function writeStore(userId: string, store: DeviceUnlockStore): Promise<void> {
  await browser.storage.local.set({ [storeKey(userId)]: JSON.stringify(store) });
}

export async function readExtensionPinUnlockWrap(userId: string): Promise<StoredPinUnlock | null> {
  return (await readStore(userId)).store.pin;
}

export async function writeExtensionPinUnlockWrap(
  userId: string,
  wrap: StoredPinUnlock | null,
): Promise<void> {
  const { store } = await readStore(userId);
  store.pin = wrap;
  await writeStore(userId, store);
}

export async function readExtensionBioUnlockWrap(userId: string): Promise<StoredBioUnlock | null> {
  return (await readStore(userId)).store.bio;
}

export async function loadExtensionBioUnlockWrap(userId: string): Promise<{
  wrap: StoredBioUnlock | null;
  wipedLegacyBio: boolean;
}> {
  const { store, wipedLegacyBio } = await readStore(userId);
  return { wrap: store.bio, wipedLegacyBio };
}

export async function writeExtensionBioUnlockWrap(
  userId: string,
  wrap: StoredBioUnlock | null,
): Promise<void> {
  const { store } = await readStore(userId);
  if (wrap) {
    store.bio = {
      credentialIdB64: wrap.credentialIdB64,
      ciphertextB64: wrap.ciphertextB64,
      prfSaltB64: wrap.prfSaltB64,
    };
  } else {
    store.bio = null;
  }
  await writeStore(userId, store);
}
