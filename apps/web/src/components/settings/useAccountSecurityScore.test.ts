import { beforeEach, describe, expect, it } from "vitest";

import type { DeviceListItemDto } from "@okkey/types";

import {
  clearSettingsPopupCache,
  setSettingsPopupCacheData,
} from "./settingsPopupCache";
import {
  countTrustedDevicesFromCache,
  useAccountSecurityScore,
} from "./useAccountSecurityScore";
import { renderHook } from "@testing-library/react";

function device(partial: Partial<DeviceListItemDto> & Pick<DeviceListItemDto, "device_id" | "status">): DeviceListItemDto {
  return {
    device_name: "Mac",
    device_fingerprint: "fp",
    platform: "web",
    os_name: "macOS",
    os_version: "14",
    app_version: "1",
    client_type: "web",
    ip_address: "1.1.1.1",
    country: null,
    city: null,
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: null,
    approved_at: null,
    is_current: false,
    approval_expires_at: null,
    ...partial,
  };
}

describe("countTrustedDevicesFromCache", () => {
  it("counts only status=trusted", () => {
    expect(
      countTrustedDevicesFromCache([
        device({ device_id: "1", status: "trusted" }),
        device({ device_id: "2", status: "pending_approval" }),
        device({ device_id: "3", status: "blocked" }),
        device({ device_id: "4", status: "trusted" }),
      ]),
    ).toBe(2);
  });

  it("returns 0 for empty/undefined", () => {
    expect(countTrustedDevicesFromCache(undefined)).toBe(0);
    expect(countTrustedDevicesFromCache([])).toBe(0);
  });
});

describe("useAccountSecurityScore devices plumbing", () => {
  beforeEach(() => {
    clearSettingsPopupCache();
  });

  it("waits for devices slice before scoring when recovery+2FA are ready", () => {
    setSettingsPopupCacheData("twoFactor", {
      enabled: true,
      backupCodesRemaining: 8,
      backupCodesGeneratedAt: "2026-09-01T00:00:00.000Z",
      backupCodesExportedAt: "2026-09-01T00:00:00.000Z",
    });
    setSettingsPopupCacheData("recovery", {
      entitlements: { recoveryKey: true, trustedDevices: true, trustedContacts: false },
      settings: { keyEnabled: true, devicesEnabled: true, contactsEnabled: false },
      key: { enrolled: true, createdAt: null, rotatedAt: null, exportedAt: "2026-09-10T00:00:00.000Z" },
      contacts: [],
      confirmedContactCount: 0,
      minConfirmedContacts: 3,
      pendingInvites: [],
      servingAsContact: [],
    });

    const { result, rerender } = renderHook(() => useAccountSecurityScore());
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(true);

    setSettingsPopupCacheData("devices", {
      devices: [
        device({ device_id: "d1", status: "trusted", is_current: true }),
        device({ device_id: "d2", status: "trusted", is_current: false }),
      ],
      pending: [],
      blocked: [],
    });
    rerender();

    expect(result.current.loading).toBe(false);
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.factorPoints.trustedDevicesPresent).toBe(5);
    expect(result.current.result?.includedFactors).toContain("trustedDevicesPresent");
  });

  it("recommends addTrustedDevice when method on and only one trusted device", () => {
    setSettingsPopupCacheData("twoFactor", {
      enabled: true,
      backupCodesRemaining: 8,
      backupCodesGeneratedAt: "2026-09-01T00:00:00.000Z",
      backupCodesExportedAt: "2026-09-01T00:00:00.000Z",
    });
    setSettingsPopupCacheData("recovery", {
      entitlements: { recoveryKey: true, trustedDevices: true, trustedContacts: false },
      settings: { keyEnabled: true, devicesEnabled: true, contactsEnabled: false },
      key: { enrolled: true, createdAt: null, rotatedAt: null, exportedAt: "2026-09-10T00:00:00.000Z" },
      contacts: [],
      confirmedContactCount: 0,
      minConfirmedContacts: 3,
      pendingInvites: [],
      servingAsContact: [],
    });
    setSettingsPopupCacheData("devices", {
      devices: [device({ device_id: "d1", status: "trusted", is_current: true })],
      pending: [],
      blocked: [],
    });

    const { result } = renderHook(() => useAccountSecurityScore());
    expect(result.current.result?.factorPoints.trustedDevicesPresent).toBe(0);
    expect(result.current.result?.recommendations.some((r) => r.id === "addTrustedDevice")).toBe(
      true,
    );
  });
});
