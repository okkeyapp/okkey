import { describe, expect, it } from "vitest";

import {
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "./DeviceTypeIcon";

describe("DeviceTypeIcon helpers", () => {
  it("maps client types to form icons", () => {
    expect(resolveDeviceFormIcon({ clientType: "extension", platform: "macos" })).toBe(
      "browserApp",
    );
    expect(resolveDeviceFormIcon({ clientType: "mobile", platform: "ios" })).toBe("phone");
    expect(resolveDeviceFormIcon({ clientType: "web", platform: "desktop" })).toBe("laptop");
  });

  it("maps os/browser hints to brand icons", () => {
    expect(resolveDeviceBrandIcon({ osName: "Windows", clientType: "desktop" })).toBe("windows");
    expect(resolveDeviceBrandIcon({ osName: "macOS", clientType: "desktop" })).toBe("apple");
    expect(resolveDeviceBrandIcon({ clientType: "web", osName: "macOS" })).toBe("chrome");
    expect(
      resolveDeviceBrandIcon({
        clientType: "web",
        osName: "macOS",
        userAgent: "Mozilla/5.0 Chrome/120",
      }),
    ).toBe("chrome");
  });
});
