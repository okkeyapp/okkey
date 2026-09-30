import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canEnableTrustedDevicesRecovery,
  MIN_TRUSTED_DEVICES_FOR_RECOVERY,
  type DeviceListItemDto,
} from "@okkey/types";

import {
  clearSettingsPopupCache,
  setSettingsPopupCacheData,
} from "./settingsPopupCache";
import {
  countTrustedDevicesFromCache,
  useAccountSecurityScore,
} from "./useAccountSecurityScore";
import { writeVaultDevicePrefs } from "../../auth/vaultDevicePrefs";
import { renderHook } from "@testing-library/react";

const authVaultState = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  vaultIdleLockMs: 900_000,
  masterPasswordChangedAt: "2026-03-01T00:00:00.000Z" as string | null,
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    userId: authVaultState.userId,
    vaultIdleLockMs: authVaultState.vaultIdleLockMs,
    masterPasswordChangedAt: authVaultState.masterPasswordChangedAt,
  }),
}));

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

function seedSecureVaultPrefs() {
  writeVaultDevicePrefs("user-1", {
    lockOnDeviceSleep: true,
    clipboardClearSeconds: 60,
    requireReauthZones: ["deletion"],
    pinEnabled: false,
    biometricEnabled: true,
  });
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

describe("canEnableTrustedDevicesRecovery", () => {
  it(`requires ≥${MIN_TRUSTED_DEVICES_FOR_RECOVERY} trusted including current`, () => {
    expect(canEnableTrustedDevicesRecovery([])).toBe(false);
    expect(
      canEnableTrustedDevicesRecovery([
        device({ device_id: "1", status: "trusted", is_current: true }),
      ]),
    ).toBe(false);
    expect(
      canEnableTrustedDevicesRecovery([
        device({ device_id: "1", status: "trusted", is_current: true }),
        device({ device_id: "2", status: "pending_approval", is_current: false }),
      ]),
    ).toBe(false);
    expect(
      canEnableTrustedDevicesRecovery([
        device({ device_id: "1", status: "trusted", is_current: false }),
        device({ device_id: "2", status: "trusted", is_current: false }),
      ]),
    ).toBe(false);
    expect(
      canEnableTrustedDevicesRecovery([
        device({ device_id: "1", status: "trusted", is_current: true }),
        device({ device_id: "2", status: "trusted", is_current: false }),
      ]),
    ).toBe(true);
  });
});

describe("useAccountSecurityScore devices + vault plumbing", () => {
  beforeEach(() => {
    clearSettingsPopupCache();
    authVaultState.userId = "user-1";
    authVaultState.vaultIdleLockMs = 900_000;
    authVaultState.masterPasswordChangedAt = "2026-03-01T00:00:00.000Z";
    seedSecureVaultPrefs();
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
      devices: [device({ device_id: "d1", status: "trusted", is_current: true })],
      pending: [],
      blocked: [],
    });
    rerender();

    expect(result.current.loading).toBe(false);
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.factorPoints.trustedDevicesRecovery).toBe(15);
    expect(result.current.result?.factorPoints.vaultIdleLock).toBe(5);
    expect(result.current.result?.includedFactors).not.toContain("trustedDevicesPresent");
  });

  it("scores vault gaps and keeps at most 4 recommendations", () => {
    writeVaultDevicePrefs("user-1", {
      lockOnDeviceSleep: false,
      clipboardClearSeconds: 0,
      requireReauthZones: [],
      pinEnabled: false,
      biometricEnabled: false,
    });
    authVaultState.vaultIdleLockMs = 3600_000;
    authVaultState.masterPasswordChangedAt = "2020-01-01T00:00:00.000Z";

    setSettingsPopupCacheData("twoFactor", {
      enabled: true,
      backupCodesRemaining: 8,
      backupCodesGeneratedAt: "2026-09-01T00:00:00.000Z",
      backupCodesExportedAt: "2026-09-01T00:00:00.000Z",
    });
    setSettingsPopupCacheData("recovery", {
      entitlements: { recoveryKey: true, trustedDevices: false, trustedContacts: false },
      settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
      key: { enrolled: true, createdAt: null, rotatedAt: null, exportedAt: "2026-09-10T00:00:00.000Z" },
      contacts: [],
      confirmedContactCount: 0,
      minConfirmedContacts: 3,
      pendingInvites: [],
      servingAsContact: [],
    });
    setSettingsPopupCacheData("devices", {
      devices: [],
      pending: [],
      blocked: [],
    });

    const { result } = renderHook(() => useAccountSecurityScore());
    expect(result.current.result?.factorPoints.vaultIdleLock).toBe(0);
    expect(result.current.result?.factorPoints.vaultBiometricOrPin).toBe(0);
    expect(result.current.result!.recommendations.length).toBeLessThanOrEqual(4);
    expect(
      result.current.result?.recommendations.every(
        (r) => r.target === "vault" || r.target === "deviceSecurity" || r.target === "deviceUnlock",
      ),
    ).toBe(true);
  });
});
