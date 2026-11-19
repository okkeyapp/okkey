import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDeviceApprovalStatus,
  clearDeviceApprovalStatusIfCurrent,
  readDeviceApprovalStatus,
  rememberDeviceApprovalStatus,
  trustFromApprovalStatus,
} from "./deviceApprovalStatus";

describe("device approval status credential", () => {
  const localWrites = new Map<string, string>();

  beforeEach(() => {
    localWrites.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localWrites.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localWrites.set(key, value);
      },
      removeItem: (key: string) => {
        localWrites.delete(key);
      },
      clear: () => {
        localWrites.clear();
      },
      key: () => null,
      length: 0,
    });
  });

  afterEach(() => {
    clearDeviceApprovalStatus();
    vi.unstubAllGlobals();
  });

  it("keeps the token in sessionStorage and not localStorage", () => {
    rememberDeviceApprovalStatus({
      token: "status-token",
      deviceId: "device-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(sessionStorage.getItem("okkey.deviceApprovalStatus")).toContain("status-token");
    expect(localWrites.size).toBe(0);
    expect(readDeviceApprovalStatus()?.token).toBe("status-token");
  });

  it("drops an expired credential", () => {
    rememberDeviceApprovalStatus({
      token: "expired-token",
      deviceId: "device-1",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    expect(readDeviceApprovalStatus()).toBeNull();
    expect(sessionStorage.getItem("okkey.deviceApprovalStatus")).toBeNull();
  });

  it("clears only when the failed token is still current", () => {
    rememberDeviceApprovalStatus({
      token: "old-token",
      deviceId: "device-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    rememberDeviceApprovalStatus({
      token: "new-token",
      deviceId: "device-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(clearDeviceApprovalStatusIfCurrent("old-token")).toBe(false);
    expect(readDeviceApprovalStatus()?.token).toBe("new-token");
    expect(clearDeviceApprovalStatusIfCurrent("new-token")).toBe(true);
    expect(readDeviceApprovalStatus()).toBeNull();
  });

  it("maps approval status onto the pending-device screen", () => {
    expect(
      trustFromApprovalStatus({
        device_id: "device-1",
        status: "rejected",
        expires_at: "2099-01-01T00:00:00.000Z",
      }).status,
    ).toBe("rejected");
    expect(
      trustFromApprovalStatus({
        device_id: "device-1",
        status: "blocked",
        blocked_until: "2099-01-01T00:00:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "blocked", blockedUntil: "2099-01-01T00:00:00.000Z" });
  });
});
