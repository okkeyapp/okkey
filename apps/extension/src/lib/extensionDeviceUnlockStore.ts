/**
 * Extension device unlock secrets (PIN / biometric wraps) in chrome.storage.local.
 * Never sent to the server; never synced across devices.
 */
import type { PinUnlockWrap } from "@okkey/crypto";

export type StoredPinUnlock = PinUnlockWrap;

export type StoredBioUnlock = {
  credentialIdB64: string;
  ciphertextB64: string;
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
    const pin = o.pin && typeof o.pin === "object" ? (o.pin as StoredPinUnlock) : null;
    const bio = o.bio && typeof o.bio === "object" ? (o.bio as StoredBioUnlock) : null;
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

async function readStore(userId: string): Promise<DeviceUnlockStore> {
  try {
    const bag = await browser.storage.local.get(storeKey(userId));
    const raw = bag[storeKey(userId)];
    return parseStore(typeof raw === "string" ? raw : null);
  } catch {
    return emptyStore();
  }
}

async function writeStore(userId: string, store: DeviceUnlockStore): Promise<void> {
  await browser.storage.local.set({ [storeKey(userId)]: JSON.stringify(store) });
}

export async function readExtensionPinUnlockWrap(userId: string): Promise<StoredPinUnlock | null> {
  return (await readStore(userId)).pin;
}

export async function writeExtensionPinUnlockWrap(
  userId: string,
  wrap: StoredPinUnlock | null,
): Promise<void> {
  const store = await readStore(userId);
  store.pin = wrap;
  await writeStore(userId, store);
}

export async function readExtensionBioUnlockWrap(userId: string): Promise<StoredBioUnlock | null> {
  return (await readStore(userId)).bio;
}

export async function writeExtensionBioUnlockWrap(
  userId: string,
  wrap: StoredBioUnlock | null,
): Promise<void> {
  const store = await readStore(userId);
  store.bio = wrap;
  await writeStore(userId, store);
}
