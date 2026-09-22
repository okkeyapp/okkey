import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  clearSettingsPopupCache,
  getSettingsPopupCacheState,
  prefetchSettingsPopupCache,
  setSettingsPopupCacheData,
  settingsPopupSliceNeedsSkeleton,
} from "./settingsPopupCache";

describe("settingsPopupCache", () => {
  beforeEach(() => {
    clearSettingsPopupCache();
  });

  it("starts idle and needs skeleton until data arrives", () => {
    const slice = getSettingsPopupCacheState().recovery;
    expect(slice.status).toBe("idle");
    expect(settingsPopupSliceNeedsSkeleton(slice)).toBe(true);
  });

  it("setData marks ready without plaintext secrets", () => {
    setSettingsPopupCacheData("recovery", {
      entitlements: { recoveryKey: true, trustedDevices: false, trustedContacts: false },
      settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
      key: {
        enrolled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        rotatedAt: null,
        exportedAt: "2026-01-02T00:00:00.000Z",
      },
      contacts: [],
      pendingInvites: [],
      servingAsContact: [],
      confirmedContactCount: 0,
      minConfirmedContacts: 3,
    });
    const slice = getSettingsPopupCacheState().recovery;
    expect(slice.status).toBe("ready");
    expect(settingsPopupSliceNeedsSkeleton(slice)).toBe(false);
    expect(JSON.stringify(slice.data)).not.toMatch(/AAAA|secret|backup/i);
  });

  it("clear resets all slices", () => {
    setSettingsPopupCacheData("devices", { devices: [], pending: [], blocked: [] });
    clearSettingsPopupCache();
    expect(getSettingsPopupCacheState().devices.status).toBe("idle");
    expect(getSettingsPopupCacheState().devices.data).toBeNull();
  });

  it("prefetch fills recovery and devices in parallel", async () => {
    const core = {
      getAccountRecoveryStatus: vi.fn(async () => ({
        entitlements: { recoveryKey: true, trustedDevices: false, trustedContacts: false },
        settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
        key: { enrolled: true, createdAt: null, rotatedAt: null, exportedAt: null },
        contacts: [],
        pendingInvites: [],
        servingAsContact: [],
        confirmedContactCount: 0,
        minConfirmedContacts: 3,
      })),
      listDevices: vi.fn(async () => ({ devices: [], pending: [], blocked: [] })),
      getLoginMethods: vi.fn(async () => ({
        email: "a@b.c",
        primary: "email",
        passkeys: [],
        hardware_keys: [],
      })),
      getAccountProfile: vi.fn(async () => ({
        email: "a@b.c",
        first_name: null,
        last_name: null,
        locale: "en",
        billing_region: "US",
        vault_idle_lock_seconds: 900,
        master_password_changed_at: null,
      })),
      getHttpClient: vi.fn(() => ({
        get: vi.fn(async () => ({
          enabled: false,
          backupCodesRemaining: 0,
          backupCodesGeneratedAt: null,
          backupCodesExportedAt: null,
        })),
      })),
    };

    await prefetchSettingsPopupCache({
      // @ts-expect-error minimal stub
      core,
      fingerprint: "f".repeat(64),
      includeLogin: true,
    });

    expect(core.getAccountRecoveryStatus).toHaveBeenCalled();
    expect(core.listDevices).toHaveBeenCalled();
    expect(core.getLoginMethods).toHaveBeenCalled();
    expect(core.getAccountProfile).toHaveBeenCalled();
    expect(getSettingsPopupCacheState().recovery.status).toBe("ready");
    expect(getSettingsPopupCacheState().devices.status).toBe("ready");
    expect(getSettingsPopupCacheState().login.status).toBe("ready");
    expect(getSettingsPopupCacheState().profile.status).toBe("ready");
  });
});
