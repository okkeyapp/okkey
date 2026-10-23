import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import { fileURLToPath } from "node:url";

import { IDLE_LOCK_OPTIONS_SECONDS } from "@okkey/vault";

import {
  clearExtensionUnlockSession,
  DEFAULT_EXTENSION_IDLE_LOCK_SECONDS,
  persistExtensionUnlockSession,
  readExtensionDevicePrefs,
  readExtensionUnlockSessionIfFresh,
  resolveExtensionIdleLockMs,
  writeExtensionDevicePrefs,
} from "./extensionVaultSession.ts";
import {
  IDLE_LOCK_ALARM,
  onDeviceIdleStateChanged,
  onIdleLockAlarm,
  onPopupClosed,
  onPopupOpened,
} from "./extensionVaultLifecycle.ts";
import {
  readExtensionPinUnlockWrap,
  writeExtensionPinUnlockWrap,
} from "./extensionDeviceUnlockStore.ts";
import { readLastServer, readSession, wipeAllExtensionData, writeLastServer, writeSession } from "./storage.ts";

type Area = {
  get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

const WASM_URL = fileURLToPath(
  new URL("../../../../packages/crypto/dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
const WASM_DATA_URL = `data:application/wasm;base64,${readFileSync(WASM_URL).toString("base64")}`;

function memoryArea(): Area {
  const data = new Map<string, unknown>();
  return {
    async get(keys) {
      if (keys == null) {
        return Object.fromEntries(data);
      }
      const list = typeof keys === "string" ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const key of list) {
        if (data.has(key)) {
          out[key] = data.get(key);
        }
      }
      return out;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value);
      }
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        data.delete(key);
      }
    },
  };
}

const alarms = new Map<string, { when?: number }>();

function installBrowser(): { local: Area; session: Area } {
  const local = memoryArea();
  const session = memoryArea();
  const browser = {
    runtime: {
      id: "test-extension",
      getURL: () => WASM_DATA_URL,
    },
    storage: { local, session },
    alarms: {
      async create(name: string, info: { when?: number }) {
        alarms.set(name, info);
      },
      async clear(name: string) {
        return alarms.delete(name);
      },
    },
  };
  const g = globalThis as { browser?: typeof browser; chrome?: typeof browser };
  g.browser = browser;
  g.chrome = browser;
  return { local, session };
}

const installed = installBrowser();

function useInstalledBrowser(): void {
  installBrowser();
  const g = globalThis as {
    browser?: { storage: { local: Area; session: Area } };
    chrome?: { storage: { local: Area; session: Area } };
  };
  if (g.browser) {
    g.browser.storage.local = installed.local;
    g.browser.storage.session = installed.session;
  }
  if (g.chrome) {
    g.chrome.storage.local = installed.local;
    g.chrome.storage.session = installed.session;
  }
}

function secrets() {
  return {
    vaultKey: new Uint8Array([1, 2, 3, 4]),
    passwordShareC: new Uint8Array([5, 6, 7, 8]),
  };
}

async function unlock(userId: string, idleLockMs = DEFAULT_EXTENSION_IDLE_LOCK_SECONDS * 1000) {
  await persistExtensionUnlockSession({
    userId,
    secrets: secrets(),
    idleLockMs,
  });
}

test("extension idle options and default are 1 hour (QA extension 07)", async () => {
  useInstalledBrowser();
  assert.deepEqual([...IDLE_LOCK_OPTIONS_SECONDS], [60, 300, 900, 1800, 3600, 14400]);
  assert.equal(DEFAULT_EXTENSION_IDLE_LOCK_SECONDS, 3600);
  const prefs = await readExtensionDevicePrefs("prefs-default-user");
  assert.equal(prefs.lockOnPopupClose, false);
  assert.equal(prefs.lockOnDeviceSleep, true);
  const ms = await resolveExtensionIdleLockMs({ userId: "prefs-default-user" });
  assert.equal(ms, 3600 * 1000);
  const seeded = await readExtensionDevicePrefs("prefs-default-user");
  assert.equal(seeded.idleLockSeconds, 3600);
});

test("unlock session lives in session storage; account login lives in local storage (QA extension 01, 08)", async () => {
  useInstalledBrowser();
  const userId = "storage-split-user";
  await writeSession({
    access_token: "account-token",
    user_id: userId,
    expires_at: "2099-01-01T00:00:00.000Z",
  });
  await unlock(userId);
  assert.ok(await readExtensionUnlockSessionIfFresh(userId));
  assert.equal((await readSession())?.access_token, "account-token");

  await installed.session.remove("okkey.vault.unlockSession.v1");
  assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
  assert.equal((await readSession())?.user_id, userId);
});

test("manual lock clears the unlock session so the popup must unlock again (QA extension 08)", async () => {
  useInstalledBrowser();
  const userId = "manual-lock-user";
  await unlock(userId);
  await clearExtensionUnlockSession();
  assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
});

test("closing the popup starts the idle countdown and does not lock when lock-on-close is off (QA extension 07)", async () => {
  useInstalledBrowser();
  const userId = "popup-close-off";
  mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  try {
    await writeExtensionDevicePrefs(userId, {
      ...(await readExtensionDevicePrefs(userId)),
      lockOnPopupClose: false,
      idleLockSeconds: 60,
    });
    await unlock(userId, 60_000);
    alarms.clear();
    await onPopupClosed();
    assert.ok(await readExtensionUnlockSessionIfFresh(userId));
    const alarm = alarms.get(IDLE_LOCK_ALARM);
    assert.equal(alarm?.when, Date.now() + 60_000);

    await onPopupOpened();
    assert.equal(alarms.has(IDLE_LOCK_ALARM), false);
    assert.ok(await readExtensionUnlockSessionIfFresh(userId));

    await onPopupClosed();
    mock.timers.tick(59_000);
    await onIdleLockAlarm();
    assert.ok(await readExtensionUnlockSessionIfFresh(userId));

    mock.timers.tick(1_000);
    await onIdleLockAlarm();
    assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
  } finally {
    mock.timers.reset();
  }
});

test("lock after closing the popup locks immediately when the setting is on (QA extension 07)", async () => {
  useInstalledBrowser();
  const userId = "popup-close-on";
  await writeExtensionDevicePrefs(userId, {
    ...(await readExtensionDevicePrefs(userId)),
    lockOnPopupClose: true,
    idleLockSeconds: 3600,
  });
  await unlock(userId);
  await onPopupClosed();
  assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
  assert.equal(alarms.has(IDLE_LOCK_ALARM), false);
});

test("sleep / OS lock honors lockOnDeviceSleep (QA extension 07)", async () => {
  useInstalledBrowser();
  const userId = "sleep-lock-user";
  await writeExtensionDevicePrefs(userId, {
    ...(await readExtensionDevicePrefs(userId)),
    lockOnDeviceSleep: false,
    idleLockSeconds: 3600,
  });
  await unlock(userId);
  await onDeviceIdleStateChanged("locked");
  assert.ok(await readExtensionUnlockSessionIfFresh(userId));

  await writeExtensionDevicePrefs(userId, {
    ...(await readExtensionDevicePrefs(userId)),
    lockOnDeviceSleep: true,
  });
  await onDeviceIdleStateChanged("idle");
  assert.ok(await readExtensionUnlockSessionIfFresh(userId));
  await onDeviceIdleStateChanged("locked");
  assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
});

test("while the popup is open, idle timeout still locks and autofill cannot read the vault key (QA extension 07)", async () => {
  useInstalledBrowser();
  const userId = "open-popup-idle";
  mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  try {
    await unlock(userId, 60_000);
    await onPopupOpened();
    mock.timers.tick(60_000);
    assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
    const popup = readFileSync(
      new URL("../entrypoints/popup/PopupApp.tsx", import.meta.url),
      "utf8",
    );
    assert.match(popup, /extensionUnlockSessionExceededIdle/);
    const autofill = readFileSync(new URL("./autofillBroker.ts", import.meta.url), "utf8");
    assert.match(autofill, /readExtensionUnlockSessionIfFresh/);
  } finally {
    mock.timers.reset();
  }
});

test("logout wipes vault, device unlock, PIN, and prefs but keeps the last server URL (QA extension 01)", async () => {
  useInstalledBrowser();
  const userId = "logout-user";
  await writeSession({
    access_token: "account-token",
    user_id: userId,
    expires_at: "2099-01-01T00:00:00.000Z",
  });
  await writeLastServer({ hostMode: "self-hosted", webBaseUrl: "https://vault.example" });
  await writeExtensionPinUnlockWrap(userId, {
    kdfSaltB64: "c2FsdA==",
    ciphertextB64: "Y2lwaGVy",
  });
  await writeExtensionDevicePrefs(userId, {
    ...(await readExtensionDevicePrefs(userId)),
    pinEnabled: true,
    idleLockSeconds: 60,
  });
  await unlock(userId);
  installed.local.set
    ? await installed.local.set({ "unrelated.bookmark": "keep-me" })
    : undefined;

  await wipeAllExtensionData();

  assert.equal(await readSession(), null);
  assert.equal(await readExtensionPinUnlockWrap(userId), null);
  assert.equal((await readLastServer())?.webBaseUrl, "https://vault.example");
  const localBag = await installed.local.get(null);
  assert.equal(localBag["unrelated.bookmark"], "keep-me");
  assert.equal(
    Object.keys(localBag).some((key) => key.startsWith("okkey.vault.") || key.startsWith("okkey.extension.session")),
    false,
  );
});

test(
  "logout clears the session-storage unlock so PIN and autofill cannot keep using it (QA extension 01)",
  { todo: true },
  async () => {
    useInstalledBrowser();
    const userId = "logout-unlock-session";
    await unlock(userId);
    await wipeAllExtensionData();
    assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
  },
);

test("wrong master password leaves the vault locked and can be retried (QA extension 02)", async () => {
  useInstalledBrowser();
  const { unlockExtensionVault } = await import("./extensionUnlock.ts");
  const userId = "wrong-password-user";
  await clearExtensionUnlockSession();
  const bundleKey = `okkey.extension.vaultBundle.u.${userId}`;
  await installed.local.set({
    [bundleKey]: {
      server_key_share_b64: "AAAA",
      device_share_b64: "AAAA",
      password_kdf_salt_b64: "AAAA",
      password_kdf_params_version: 2,
      encrypted_private_key: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: "AAAA",
        meta: {},
      },
    },
  });
  const core = { getVaultUnlockBootstrap: async () => {
  useInstalledBrowser(); throw new Error("unused"); } };
  const first = await unlockExtensionVault({
    core: core as never,
    userId,
    masterPassword: "not-the-password",
  });
  const second = await unlockExtensionVault({
    core: core as never,
    userId,
    masterPassword: "still-wrong",
  });
  assert.equal(first, null);
  assert.equal(second, null);
  assert.equal(await readExtensionUnlockSessionIfFresh(userId), null);
});
