import { afterEach, describe, expect, it } from "vitest";

import {
  clearDeviceApprovalStatus,
  readDeviceApprovalStatus,
  rememberDeviceApprovalStatus,
  trustFromApprovalStatus,
} from "./deviceApprovalStatus";

describe("device approval status credential", () => {
  afterEach(() => {
    clearDeviceApprovalStatus();
    localStorage.clear();
  });

  it("keeps the token in sessionStorage and not localStorage", () => {
    rememberDeviceApprovalStatus({
      token: "status-token",
      deviceId: "device-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(sessionStorage.getItem("okkey.deviceApprovalStatus")).toContain("status-token");
    expect(localStorage.getItem("okkey.deviceApprovalStatus")).toBeNull();
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
