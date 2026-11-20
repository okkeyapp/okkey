import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  listDevices: vi.fn(),
  approveDevice: vi.fn(),
  rejectDevice: vi.fn(),
  blockDevice: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  userId: "user-1" as string | undefined,
  vaultUnlocked: true,
  currentDeviceId: "d-current" as string | null,
}));

const shareMocks = vi.hoisted(() => ({
  sealLocalShareForPendingDevice: vi.fn(async () => new Uint8Array([1, 1, 1])),
  readVaultBundle: vi.fn(() => ({ device_share_b64: "bG9jYWw=" })),
  replacementDeviceShareForApproval: vi.fn(async () => "wrapped-share"),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMocks,
  useAuthVault: () => ({
    hasVaultBundle: true,
    currentDeviceId: authState.currentDeviceId,
    vaultUnlocked: authState.vaultUnlocked,
    userId: authState.userId,
  }),
}));

vi.mock("../../auth/deviceShareDelivery", () => ({
  sealLocalShareForPendingDevice: (...args: unknown[]) =>
    shareMocks.sealLocalShareForPendingDevice(...args),
}));

vi.mock("../../auth/localVaultBundle", () => ({
  readVaultBundle: (...args: unknown[]) => shareMocks.readVaultBundle(...args),
}));

vi.mock("../../auth/approveDeviceShare", () => ({
  replacementDeviceShareForApproval: (...args: unknown[]) =>
    shareMocks.replacementDeviceShareForApproval(...args),
}));

vi.mock("../../auth/deviceFingerprint", () => ({
  getOrCreateDeviceFingerprint: () => "a".repeat(64),
}));

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../settings/DeviceTypeIcon", () => ({
  resolveDeviceFormIcon: () => "laptop",
  resolveDeviceBrandIcon: () => "chrome",
}));

vi.mock("../settings/settingsPopupCache", () => ({
  refreshSettingsDevicesCache: vi.fn(async () => undefined),
  setSettingsPopupCacheData: vi.fn(),
}));

import { toast } from "sonner";

import DeviceApprovalController from "./DeviceApprovalController";

function pendingDevice(overrides?: Record<string, unknown>) {
  return {
    device_id: "d-pending",
    device_name: "Chrome Extension",
    device_fingerprint: "b".repeat(64),
    status: "pending_approval",
    platform: "extension",
    os_name: "Chrome",
    os_version: "120",
    app_version: "extension",
    client_type: "extension",
    ip_address: "10.0.0.1",
    country: "US",
    city: "NYC",
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: null,
    approved_at: null,
    is_current: false,
    approval_expires_at: "2026-01-01T01:00:00.000Z",
    one_time_x25519_public_key: "eDI=",
    one_time_mlkem_public_key: "bWw=",
    ...overrides,
  };
}

describe("DeviceApprovalController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.userId = "user-1";
    authState.vaultUnlocked = true;
    authState.currentDeviceId = "d-current";
    shareMocks.sealLocalShareForPendingDevice.mockResolvedValue(new Uint8Array([1, 1, 1]));
    coreMocks.listDevices.mockResolvedValue({
      devices: [],
      pending: [pendingDevice()],
      blocked: [],
    });
    coreMocks.approveDevice.mockResolvedValue({
      device_id: "d-pending",
      status: "pending_approval",
    });
  });

  it("disables Trust after click, sends a single approve, and dismisses on pending_approval", async () => {
    let resolveApprove: ((value: { device_id: string; status: string }) => void) | undefined;
    coreMocks.approveDevice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApprove = resolve;
        }),
    );

    render(<DeviceApprovalController />);
    expect(
      await screen.findAllByText("web.settingsPopup.devices.pending.title"),
    ).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "web.settingsPopup.devices.pending.trust" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "web.settingsPopup.devices.pending.trusting" }),
      ).toBeDisabled();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "web.settingsPopup.devices.pending.trusting" }),
    );
    expect(coreMocks.approveDevice).toHaveBeenCalledTimes(1);

    resolveApprove?.({ device_id: "d-pending", status: "pending_approval" });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "web.settingsPopup.devices.toast.approvedWaiting",
      );
    });
    expect(screen.queryAllByText("web.settingsPopup.devices.pending.title")).toHaveLength(0);
  });

  it("shows an error and re-enables Trust when approve fails", async () => {
    coreMocks.approveDevice.mockRejectedValue(new Error("boom"));

    render(<DeviceApprovalController />);
    expect(
      await screen.findAllByText("web.settingsPopup.devices.pending.title"),
    ).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "web.settingsPopup.devices.pending.trust" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("web.settingsPopup.devices.error.generic");
    });
    expect(
      screen.getByRole("button", { name: "web.settingsPopup.devices.pending.trust" }),
    ).not.toBeDisabled();
  });
});
