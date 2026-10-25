import test from "node:test";
import assert from "node:assert/strict";

import { probeExtensionDeviceTrusted } from "./deviceTrust.ts";
import { STORAGE_KEYS } from "./storage.ts";

/** Minimal device list row for probe mocks (avoid `@okkey/*` dist at load time). */
type DeviceListItemDto = {
  device_id: string;
  device_name: string;
  device_fingerprint: string;
  status: "trusted" | "pending_approval" | "blocked";
  platform: string;
  os_name: string;
  os_version: string;
  app_version: string;
  client_type: string;
  ip_address: string;
  country: string | null;
  city: string | null;
  created_at: string;
  last_seen_at: string | null;
  approved_at: string | null;
  is_current: boolean;
  approval_expires_at: string | null;
  blocked_until?: string | null;
};

type CoreApiClient = {
  listDevices: (fingerprint?: string) => Promise<{
    devices: DeviceListItemDto[];
    pending: DeviceListItemDto[];
    blocked?: DeviceListItemDto[];
  }>;
  registerDevice?: () => Promise<{
    device_id: string;
    status: "pending" | "trusted" | "blocked";
    blocked_until: string | null;
  }>;
};

/** Keep in sync with `VAULT_UNLOCK_SESSION_STORAGE_KEY` in `@okkey/vault`. */
const UNLOCK_SESSION_STORAGE_KEY = "okkey.vault.unlockSession.v1";

type StorageAreaMock = {
  get: (keys?: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear?: () => Promise<void>;
};

function installStorageMocks(input: {
  local: Record<string, unknown>;
  session: Record<string, unknown>;
}): {
  session: Record<string, unknown>;
  restore: () => void;
} {
  const store = input.local;
  const sessionStore = input.session;
  const g = globalThis as {
    browser?: {
      storage?: { local?: StorageAreaMock; session?: StorageAreaMock };
      runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> };
    };
    chrome?: {
      storage?: { local?: StorageAreaMock; session?: StorageAreaMock };
    };
  };
  const prevBrowser = g.browser;
  const prevChrome = g.chrome;

  const localArea: StorageAreaMock = {
    async get(keys) {
      if (keys == null) return { ...store };
      if (typeof keys === "string") {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      return {};
    },
    async set(items) {
      Object.assign(store, items);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete store[key];
      }
    },
  };
  const sessionArea: StorageAreaMock = {
    async get(keys) {
      if (typeof keys === "string") {
        return keys in sessionStore ? { [keys]: sessionStore[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in sessionStore) out[key] = sessionStore[key];
        }
        return out;
      }
      return { ...sessionStore };
    },
    async set(items) {
      Object.assign(sessionStore, items);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete sessionStore[key];
      }
    },
    async clear() {
      for (const key of Object.keys(sessionStore)) {
        delete sessionStore[key];
      }
    },
  };

  g.browser = {
    storage: { local: localArea, session: sessionArea },
    runtime: {
      async sendMessage() {
        return { ok: true };
      },
    },
  };
  g.chrome = { storage: { local: localArea, session: sessionArea } };

  return {
    session: sessionStore,
    restore() {
      g.browser = prevBrowser;
      g.chrome = prevChrome;
    },
  };
}

function device(partial: Partial<DeviceListItemDto> & Pick<DeviceListItemDto, "device_id">): DeviceListItemDto {
  return {
    device_id: partial.device_id,
    device_name: partial.device_name ?? "Ext",
    device_fingerprint: partial.device_fingerprint ?? "fp-1",
    status: partial.status ?? "trusted",
    platform: partial.platform ?? "extension",
    os_name: partial.os_name ?? "Chrome",
    os_version: partial.os_version ?? "1",
    app_version: partial.app_version ?? "extension",
    client_type: partial.client_type ?? "extension",
    ip_address: partial.ip_address ?? "127.0.0.1",
    country: partial.country ?? null,
    city: partial.city ?? null,
    created_at: partial.created_at ?? "2026-01-01T00:00:00Z",
    last_seen_at: partial.last_seen_at ?? null,
    approved_at: partial.approved_at ?? null,
    is_current: partial.is_current ?? false,
    approval_expires_at: partial.approval_expires_at ?? null,
    blocked_until: partial.blocked_until ?? null,
  };
}

test("probeExtensionDeviceTrusted clears unlock session when device was revoked", async () => {
  const mocks = installStorageMocks({
    local: {
      [STORAGE_KEYS.deviceId]: "dev-old",
      [STORAGE_KEYS.deviceFingerprint]: "fp-1",
    },
    session: {
      [UNLOCK_SESSION_STORAGE_KEY]: JSON.stringify({
        v: 1,
        user_id: "u1",
        vault_key_b64: "AAAA",
        password_share_c_b64: "BBBB",
        last_activity_at: Date.now(),
        idle_lock_ms: 3_600_000,
      }),
    },
  });

  const core = {
    async listDevices() {
      // Revoked: fingerprint absent from trusted (and not pending/blocked).
      return { devices: [], pending: [], blocked: [] };
    },
  } as unknown as CoreApiClient;

  try {
    const result = await probeExtensionDeviceTrusted(core);
    assert.equal(result, "untrusted");
    assert.equal(Object.keys(mocks.session).length, 0, "unlock session must be wiped");
  } finally {
    mocks.restore();
  }
});

test("probeExtensionDeviceTrusted keeps session when still trusted", async () => {
  const unlock = JSON.stringify({
    v: 1,
    user_id: "u1",
    vault_key_b64: "AAAA",
    password_share_c_b64: "BBBB",
    last_activity_at: Date.now(),
    idle_lock_ms: 3_600_000,
  });
  const mocks = installStorageMocks({
    local: {
      [STORAGE_KEYS.deviceId]: "dev-1",
      [STORAGE_KEYS.deviceFingerprint]: "fp-1",
    },
    session: {
      [UNLOCK_SESSION_STORAGE_KEY]: unlock,
    },
  });

  const core = {
    async listDevices() {
      return {
        devices: [device({ device_id: "dev-1", device_fingerprint: "fp-1", status: "trusted" })],
        pending: [],
        blocked: [],
      };
    },
  } as unknown as CoreApiClient;

  try {
    const result = await probeExtensionDeviceTrusted(core);
    assert.equal(result, "trusted");
    assert.equal(mocks.session[UNLOCK_SESSION_STORAGE_KEY], unlock);
  } finally {
    mocks.restore();
  }
});

test("probeExtensionDeviceTrusted does not auto-register after revoke", async () => {
  const mocks = installStorageMocks({
    local: {
      [STORAGE_KEYS.deviceId]: "dev-old",
      [STORAGE_KEYS.deviceFingerprint]: "fp-1",
      [STORAGE_KEYS.devicePublicKey]: "cHVi",
    },
    session: {
      [UNLOCK_SESSION_STORAGE_KEY]: JSON.stringify({
        v: 1,
        user_id: "u1",
        vault_key_b64: "AAAA",
        last_activity_at: Date.now(),
        idle_lock_ms: 3_600_000,
      }),
    },
  });

  let registerCalls = 0;
  const core = {
    async listDevices() {
      return { devices: [], pending: [], blocked: [] };
    },
    async registerDevice() {
      registerCalls += 1;
      return { device_id: "dev-new", status: "pending" as const, blocked_until: null };
    },
  } as unknown as CoreApiClient;

  try {
    await probeExtensionDeviceTrusted(core);
    assert.equal(registerCalls, 0, "background probe must not re-register");
  } finally {
    mocks.restore();
  }
});
