import { describe, expect, it } from "vitest";

import {
  formatClientLabelFromType,
  formatDeviceClientOs,
  formatDeviceTitle,
  parseBrowserEnvironment,
} from "./browserEnvironment";

describe("parseBrowserEnvironment", () => {
  it("builds Web macOS - Safari title for Safari on macOS", () => {
    const env = parseBrowserEnvironment(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    expect(env.clientType).toBe("safari");
    expect(env.deviceName).toBe("Web macOS - Safari");
    expect(env.platformOsLabel).toBe("Safari · macOS");
    expect(env.hardwareLabel).toBe("macOS");
    expect(env.fingerprint).toBe("web_app-safari-macos-10.15.7");
  });

  it("detects Yandex Browser before Chrome", () => {
    const env = parseBrowserEnvironment(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.0.0 Safari/537.36",
    );
    expect(env.clientType).toBe("yandex");
    expect(env.deviceName).toBe("Web macOS - Yandex");
    expect(env.fingerprint).toBe("web_app-yandex-macos-10.15.7");
  });

  it("detects Chrome on macOS", () => {
    const env = parseBrowserEnvironment(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(env.clientType).toBe("chrome");
    expect(env.deviceName).toBe("Web macOS - Chrome");
    expect(env.fingerprint).toBe("web_app-chrome-macos-10.15.7");
  });

  it("detects Firefox with a distinct fingerprint from Chrome", () => {
    const env = parseBrowserEnvironment(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    );
    expect(env.clientType).toBe("firefox");
    expect(env.deviceName).toBe("Web macOS - Firefox");
    expect(env.fingerprint).toBe("web_app-firefox-macos-10.15");
    expect(env.fingerprint).not.toBe(
      parseBrowserEnvironment(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ).fingerprint,
    );
  });

  it("uses browser id on mobile web fingerprints", () => {
    const env = parseBrowserEnvironment(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(env.channel).toBe("Mobile");
    expect(env.clientType).toBe("safari");
    expect(env.fingerprint).toBe("mobile_app-safari-ios-17.0");
  });
});

describe("formatClientLabelFromType", () => {
  it("maps known client types", () => {
    expect(formatClientLabelFromType("safari")).toBe("Safari");
    expect(formatClientLabelFromType("yandex")).toBe("Yandex");
    expect(formatClientLabelFromType("web")).toBe("Web");
    expect(formatClientLabelFromType("desktop")).toBe("App");
  });
});

describe("formatDeviceClientOs / formatDeviceTitle", () => {
  it("infers Chrome · macOS from legacy UA device_name when fields are unknown", () => {
    const device = {
      device_name:
        "Web · Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      client_type: "web",
      os_name: "unknown",
      platform: "unknown",
    };
    expect(formatDeviceClientOs(device)).toBe("Chrome · macOS");
    expect(formatDeviceTitle(device)).toBe("Web macOS - Chrome");
  });

  it("keeps stored full title", () => {
    const device = {
      device_name: "Web macOS - Chrome",
      client_type: "chrome",
      os_name: "macOS",
    };
    expect(formatDeviceTitle(device)).toBe("Web macOS - Chrome");
    expect(formatDeviceClientOs(device)).toBe("Chrome · macOS");
  });

  it("rebuilds title from legacy short device_name", () => {
    expect(
      formatDeviceTitle({
        device_name: "macOS",
        client_type: "chrome",
        os_name: "macOS",
        platform: "desktop",
      }),
    ).toBe("Web macOS - Chrome");
  });

  it("keeps user rename instead of auto title", () => {
    expect(
      formatDeviceTitle({
        device_name: "Alexander",
        client_type: "chrome",
        os_name: "macOS",
        user_agent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }),
    ).toBe("Alexander");
  });
});
