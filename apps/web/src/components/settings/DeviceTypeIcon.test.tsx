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

  it("accepts snake_case wire fields for form icons", () => {
    expect(resolveDeviceFormIcon({ client_type: "extension", platform: "macos" })).toBe(
      "browserApp",
    );
    expect(resolveDeviceFormIcon({ client_type: "mobile", platform: "ios" })).toBe("phone");
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

  it("resolves brand from snake_case device_name UA when os is unknown", () => {
    expect(
      resolveDeviceBrandIcon({
        client_type: "web",
        os_name: "unknown",
        platform: "unknown",
        device_name:
          "Web · Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120",
      }),
    ).toBe("chrome");
  });
});
