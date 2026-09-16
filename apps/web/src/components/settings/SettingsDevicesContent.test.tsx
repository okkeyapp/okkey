import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  listDevices: vi.fn(),
  approveDevice: vi.fn(),
  revokeDevice: vi.fn(),
  patchDevice: vi.fn(),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMocks,
}));

vi.mock("../../auth/deviceFingerprint", () => ({
  getOrCreateDeviceFingerprint: () => "a".repeat(64),
}));

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({ locale: "ru", t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("./DeviceTypeIcon", () => ({
  DeviceTypeIcon: () => <div data-testid="device-icon" />,
  resolveDeviceFormIcon: () => "laptop",
  resolveDeviceBrandIcon: () => "windows",
}));

import SettingsDevicesContent from "./SettingsDevicesContent";

const t = (key: string, values?: Record<string, string | number>) => {
  if (!values) {
    return key;
  }
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    key,
  );
};

function trustedDevice(overrides?: Record<string, unknown>) {
  return {
    device_id: "d-current",
    device_name: "Web app iMac",
    device_fingerprint: "a".repeat(64),
    status: "trusted",
    platform: "desktop",
    os_name: "macOS",
    os_version: "14",
    app_version: "1.0.0",
    client_type: "web",
    ip_address: "10.0.0.1",
    country: "Singapore",
    city: "Singapore",
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: new Date().toISOString(),
    approved_at: "2026-01-01T00:00:00.000Z",
    is_current: true,
    approval_expires_at: null,
    ...overrides,
  };
}

function pendingDevice(overrides?: Record<string, unknown>) {
  return {
    device_id: "d-pending",
    device_name: "Windows 11",
    device_fingerprint: "b".repeat(64),
    status: "pending_approval",
    platform: "desktop",
    os_name: "Windows",
    os_version: "11",
    app_version: "1.0.0",
    client_type: "desktop",
    ip_address: "82.123.321.44",
    country: "Singapore",
    city: "Singapore",
    created_at: new Date().toISOString(),
    last_seen_at: null,
    approved_at: null,
    is_current: false,
    approval_expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe("SettingsDevicesContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coreMocks.listDevices.mockResolvedValue({
      devices: [trustedDevice()],
      pending: [pendingDevice()],
    });
    coreMocks.approveDevice.mockResolvedValue({ device_id: "d-pending", status: "trusted" });
    coreMocks.revokeDevice.mockResolvedValue({ device_id: "d-pending", status: "revoked" });
    coreMocks.patchDevice.mockResolvedValue({
      device_id: "d-other",
      device_name: "Renamed",
    });
  });

  it("renders pending banner and trusted list", async () => {
    render(<SettingsDevicesContent t={t} />);

    expect(await screen.findByText("Windows 11")).toBeTruthy();
    expect(screen.getByText("Web app iMac")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.devices.pending.trust")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.devices.list.currentBadge")).toBeTruthy();
  });

  it("trusts pending device via approveDevice", async () => {
    coreMocks.listDevices
      .mockResolvedValueOnce({
        devices: [trustedDevice()],
        pending: [pendingDevice()],
      })
      .mockResolvedValueOnce({
        devices: [trustedDevice(), trustedDevice({ device_id: "d-pending", is_current: false })],
        pending: [],
      });

    render(<SettingsDevicesContent t={t} />);
    await screen.findByText("Windows 11");

    fireEvent.click(screen.getByText("web.settingsPopup.devices.pending.trust"));

    await waitFor(() => {
      expect(coreMocks.approveDevice).toHaveBeenCalledWith("d-pending", "d-current");
    });
  });

  it("dismisses pending device via revokeDevice", async () => {
    coreMocks.listDevices
      .mockResolvedValueOnce({
        devices: [trustedDevice()],
        pending: [pendingDevice()],
      })
      .mockResolvedValueOnce({
        devices: [trustedDevice()],
        pending: [],
      });

    render(<SettingsDevicesContent t={t} />);
    await screen.findByText("Windows 11");

    fireEvent.click(screen.getByText("web.settingsPopup.devices.pending.notNow"));

    await waitFor(() => {
      expect(coreMocks.revokeDevice).toHaveBeenCalledWith("d-pending", "dismissed by user");
    });
  });

  it("retry reloads the device list after an error", async () => {
    coreMocks.listDevices
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        devices: [trustedDevice()],
        pending: [],
      });

    render(<SettingsDevicesContent t={t} />);

    expect(await screen.findByText("web.settingsPopup.devices.error.generic")).toBeTruthy();
    fireEvent.click(screen.getByText("web.settingsPopup.devices.retry"));

    expect(await screen.findByText("Web app iMac")).toBeTruthy();
    expect(coreMocks.listDevices).toHaveBeenCalledTimes(2);
  });
});
