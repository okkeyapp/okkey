import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_VAULT_DEVICE_PREFS,
  lockOnSleepMigrationMarkerValue,
  parseVaultDevicePrefs,
  readVaultDevicePrefsMigratingLockOnSleep,
  resolveVaultDevicePrefsRead,
  serializeVaultDevicePrefs,
  vaultDevicePrefsKey,
  vaultLockOnSleepMigrationKey,
  type VaultDevicePrefs,
  type VaultDevicePrefsStorage,
} from "./vault-device-prefs.ts";

const USER = "user-1";

function memoryStorage(initial: Record<string, string> = {}): VaultDevicePrefsStorage & {
  store: Map<string, string>;
  writes: string[];
} {
  const store = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    store,
    writes,
    async getItem(key: string) {
      return store.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      writes.push(key);
      store.set(key, value);
    },
  };
}

function saved(prefs: Partial<VaultDevicePrefs> & Pick<VaultDevicePrefs, "lockOnDeviceSleep">): string {
  return serializeVaultDevicePrefs({
    lockOnPopupClose: false,
    clipboardClearSeconds: 0,
    requireReauthZones: [],
    pinEnabled: false,
    biometricEnabled: false,
    ...prefs,
  });
}

describe("vault device prefs sleep-lock default", () => {
  it("defaults lockOnDeviceSleep to false for a fresh user", async () => {
    assert.equal(DEFAULT_VAULT_DEVICE_PREFS.lockOnDeviceSleep, false);
    const storage = memoryStorage();
    const prefs = await readVaultDevicePrefsMigratingLockOnSleep(USER, storage, false);
    assert.equal(prefs.lockOnDeviceSleep, false);
    assert.equal(storage.store.has(vaultDevicePrefsKey(USER)), false);
    assert.equal(storage.store.get(vaultLockOnSleepMigrationKey(USER)), lockOnSleepMigrationMarkerValue());
  });

  it("preserves an existing saved value", async () => {
    const storage = memoryStorage({
      [vaultDevicePrefsKey(USER)]: saved({ lockOnDeviceSleep: false, clipboardClearSeconds: 30 }),
    });
    const writesBefore = storage.writes.length;
    const prefs = await readVaultDevicePrefsMigratingLockOnSleep(USER, storage, true);
    assert.equal(prefs.lockOnDeviceSleep, false);
    assert.equal(prefs.clipboardClearSeconds, 30);
    assert.equal(storage.writes.length, writesBefore);

    storage.store.set(vaultDevicePrefsKey(USER), saved({ lockOnDeviceSleep: true }));
    const kept = await readVaultDevicePrefsMigratingLockOnSleep(USER, storage, false);
    assert.equal(kept.lockOnDeviceSleep, true);
    assert.equal(storage.writes.length, writesBefore);
  });

  it("persists lockOnDeviceSleep true once when the device already had state", async () => {
    const storage = memoryStorage();
    const first = await readVaultDevicePrefsMigratingLockOnSleep(USER, storage, true);
    assert.equal(first.lockOnDeviceSleep, true);
    const stored = storage.store.get(vaultDevicePrefsKey(USER));
    assert.equal(stored?.includes('"lockOnDeviceSleep":true'), true);
    assert.equal(storage.store.get(vaultLockOnSleepMigrationKey(USER)), lockOnSleepMigrationMarkerValue());

    const writesAfterFirst = storage.writes.length;
    const second = await readVaultDevicePrefsMigratingLockOnSleep(USER, storage, true);
    assert.equal(second.lockOnDeviceSleep, true);
    assert.equal(storage.writes.length, writesAfterFirst);

    storage.store.set(vaultDevicePrefsKey(USER), saved({ lockOnDeviceSleep: false }));
    const edited = await readVaultDevicePrefsMigratingLockOnSleep(USER, storage, true);
    assert.equal(edited.lockOnDeviceSleep, false);
    assert.equal(storage.writes.length, writesAfterFirst);
  });

  it("does not migrate again after the marker is stored without prefs", async () => {
    const storage = memoryStorage({
      [vaultLockOnSleepMigrationKey(USER)]: lockOnSleepMigrationMarkerValue(),
    });
    const prefs = await readVaultDevicePrefsMigratingLockOnSleep(USER, storage, true);
    assert.equal(prefs.lockOnDeviceSleep, false);
    assert.equal(storage.store.has(vaultDevicePrefsKey(USER)), false);
    assert.equal(storage.writes.length, 0);
  });

  it("keeps the previous default when a stored record omits lockOnDeviceSleep", () => {
    const plan = resolveVaultDevicePrefsRead({
      savedPrefsRaw: JSON.stringify({ clipboardClearSeconds: 10 }),
      migrationMarkerRaw: null,
      hasPriorUserState: true,
    });
    assert.equal(plan.prefs.lockOnDeviceSleep, true);
    assert.equal(plan.prefs.clipboardClearSeconds, 10);
    assert.equal(plan.persistPrefs, false);
    assert.equal(plan.persistMigrationMarker, false);
    assert.equal(parseVaultDevicePrefs(null).lockOnDeviceSleep, false);
  });
});
