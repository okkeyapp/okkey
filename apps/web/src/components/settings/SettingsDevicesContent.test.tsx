import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  listDevices: vi.fn(),
  approveDevice: vi.fn(),
  revokeDevice: vi.fn(),
  rejectDevice: vi.fn(),
  patchDevice: vi.fn(),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMocks,
  useAuthVault: () => ({ hasVaultBundle: true, currentDeviceId: "d-current" }),
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

import SettingsDevicesContent, { parseOsFromDeviceName } from "./SettingsDevicesContent";

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
    device_name: "Web macOS - Chrome",
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
    device_name: "Desktop Windows 11 - App",
    device_fingerprint: "b".repeat(64),
    status: "pending_approval",
    platform: "desktop",
    os_name: "Windows 11",
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

describe("parseOsFromDeviceName", () => {
  it("extracts OS from UA-style device names", () => {
    expect(
      parseOsFromDeviceName(
        "Web · Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ),
    ).toBe("macOS");
    expect(parseOsFromDeviceName("Web · Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "Windows",
    );
    expect(parseOsFromDeviceName("Friendly laptop")).toBeNull();
  });
});

describe("SettingsDevicesContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coreMocks.listDevices.mockResolvedValue({
      devices: [trustedDevice()],
      pending: [pendingDevice()],
    });
    coreMocks.approveDevice.mockResolvedValue({ device_id: "d-pending", status: "trusted" });
    coreMocks.revokeDevice.mockResolvedValue({ device_id: "d-pending", status: "revoked" });
    coreMocks.rejectDevice.mockResolvedValue({ device_id: "d-pending", status: "revoked" });
    coreMocks.patchDevice.mockResolvedValue({
      device_id: "d-other",
      device_name: "Renamed",
    });
  });

  it("renders pending banner and trusted list", async () => {
    render(<SettingsDevicesContent t={t} />);

    expect(await screen.findByText("Desktop Windows 11 - App")).toBeTruthy();
    expect(screen.getByText("Web macOS - Chrome")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.devices.pending.trust")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.devices.list.currentBadge")).toBeTruthy();
  });

  it("shows OS inferred from device_name when os_name is unknown", async () => {
    coreMocks.listDevices.mockResolvedValue({
      devices: [
        trustedDevice({
          device_name:
            "Web · Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          os_name: "unknown",
          platform: "unknown",
        }),
      ],
      pending: [],
    });

    render(<SettingsDevicesContent t={t} />);

    expect(await screen.findByText("Chrome · macOS")).toBeTruthy();
    expect(screen.getByText("Web macOS - Chrome")).toBeTruthy();
  });

  it("marks device current via fingerprint when API is_current is false", async () => {
    coreMocks.listDevices.mockResolvedValue({
      devices: [
        trustedDevice({
          is_current: false,
          device_fingerprint: "a".repeat(64),
        }),
        trustedDevice({
          device_id: "d-other",
          device_name: "Other laptop",
          device_fingerprint: "b".repeat(64),
          is_current: false,
        }),
      ],
      pending: [],
    });

    render(<SettingsDevicesContent t={t} />);

    expect(await screen.findByText("Web macOS - Chrome")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.devices.list.currentBadge")).toBeTruthy();
    expect(screen.getAllByLabelText("web.settingsPopup.devices.actions.menu")).toHaveLength(1);
  });

  it("does not mark sole trusted device current when fingerprints differ", async () => {
    coreMocks.listDevices.mockResolvedValue({
      devices: [
        trustedDevice({
          device_id: "d-other",
          is_current: false,
          device_fingerprint: "f".repeat(64),
        }),
      ],
      pending: [],
    });

    render(<SettingsDevicesContent t={t} />);

    expect(await screen.findByText("Web macOS - Chrome")).toBeTruthy();
    expect(screen.queryByText("web.settingsPopup.devices.list.currentBadge")).toBeNull();
    expect(screen.getByLabelText("web.settingsPopup.devices.actions.menu")).toBeTruthy();
  });

  it("hides actions menu for the current device", async () => {
    coreMocks.listDevices.mockResolvedValue({
      devices: [
        trustedDevice(),
        trustedDevice({
          device_id: "d-other",
          device_name: "Other laptop",
          device_fingerprint: "b".repeat(64),
          is_current: false,
        }),
      ],
      pending: [],
    });

    render(<SettingsDevicesContent t={t} />);

    expect(await screen.findByText("Web macOS - Chrome")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.devices.list.currentBadge")).toBeTruthy();
    expect(screen.getAllByLabelText("web.settingsPopup.devices.actions.menu")).toHaveLength(1);
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
    await screen.findByText("Desktop Windows 11 - App");

    fireEvent.click(screen.getByText("web.settingsPopup.devices.pending.trust"));

    await waitFor(() => {
      expect(coreMocks.approveDevice).toHaveBeenCalledWith("d-pending", "d-current");
    });
  });

  it("dismisses pending device via rejectDevice", async () => {
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
    await screen.findByText("Desktop Windows 11 - App");

    fireEvent.click(screen.getByText("web.settingsPopup.devices.pending.notNow"));

    await waitFor(() => {
      expect(coreMocks.rejectDevice).toHaveBeenCalledWith(
        "d-pending",
        "d-current",
        "dismissed by user",
      );
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

    expect(await screen.findByText("Web macOS - Chrome")).toBeTruthy();
    expect(coreMocks.listDevices).toHaveBeenCalledTimes(2);
  });
});
