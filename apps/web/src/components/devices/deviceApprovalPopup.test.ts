import { describe, expect, it } from "vitest";

import {
  approvalResponseGrantsTrust,
  deviceDecisionToastKey,
  pendingApprovalKey,
  visiblePendingDevices,
} from "./deviceApprovalPopup";

function pending(createdAt: string) {
  return { device_id: "device-1", created_at: createdAt };
}

describe("device approval popup", () => {
  it("uses the denial toast for Not now and keeps revoke copy for a real revoke", () => {
    expect(deviceDecisionToastKey("reject")).toBe("web.settingsPopup.devices.toast.rejected");
    expect(deviceDecisionToastKey("approve")).toBe("web.settingsPopup.devices.toast.trusted");
    expect(deviceDecisionToastKey("reject")).not.toBe("web.settingsPopup.devices.toast.revoked");
  });

  it("does not treat pending_approval as a granted trust", () => {
    expect(approvalResponseGrantsTrust("trusted")).toBe(true);
    expect(approvalResponseGrantsTrust("pending_approval")).toBe(false);
    expect(approvalResponseGrantsTrust(undefined)).toBe(false);
  });

  it("hides a dismissed request and shows a later request for the same device", () => {
    const first = pending("2026-01-01T00:00:00.000Z");
    const again = pending("2026-01-01T00:05:00.000Z");
    const dismissed = new Set([pendingApprovalKey(first)]);

    expect(visiblePendingDevices([first], dismissed)).toEqual([]);
    expect(visiblePendingDevices([again], dismissed)).toEqual([again]);
    expect(pendingApprovalKey(first)).not.toBe(pendingApprovalKey(again));
  });
});
