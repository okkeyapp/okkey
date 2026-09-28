import {
  EXTENSION_DEVICE_CHANNEL,
  EXTENSION_FINGERPRINT_PREFIX,
  OKKEY_SAAS_WEB_BASE_URL,
} from "./deviceChannel.ts";

export type BrowserClientId =
  | "chrome"
  | "safari"
  | "firefox"
  | "edge"
  | "opera"
  | "yandex"
  | "vivaldi"
  | "tor"
  | "web";

export type DeviceChannel = "Web" | "Mobile" | "Desktop" | "Extension";

export type ParsedBrowserEnvironment = {
  clientType: string;
  clientLabel: string;
  channel: DeviceChannel;
  platform: string;
  osName: string;
  osVersion: string;
  hardwareLabel: string;
  deviceName: string;
  platformOsLabel: string;
  fingerprint: string;
  userAgent: string;
};

const CLIENT_LABELS: Record<BrowserClientId, string> = {
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  opera: "Opera",
  yandex: "Yandex",
  vivaldi: "Vivaldi",
  tor: "Tor",
  web: "Web",
};

export type ParseBrowserEnvironmentOptions = {
  channel?: DeviceChannel;
};

/**
 * Port of web `parseBrowserEnvironment` for extension use (no apps/web import).
 * Always pass `{ channel: "Extension" }` from extension callers.
 */
export function parseBrowserEnvironment(
  userAgent = "",
  options: ParseBrowserEnvironmentOptions = {},
): ParsedBrowserEnvironment {
  const ua = userAgent.trim();
  const browserId = detectBrowserClient(ua);
  const { platform, osName, osVersion, hardwareLabel } = detectHardware(ua);
  const channel = options.channel ?? EXTENSION_DEVICE_CHANNEL;
  const clientLabel = CLIENT_LABELS[browserId];
  const clientType =
    browserId === "web"
      ? channel === "Extension"
        ? "extension"
        : "web"
      : browserId;

  const deviceName = `${channel} ${hardwareLabel} - ${clientLabel}`;
  const osLabel = osName === "unknown" ? hardwareLabel : osName;
  const platformOsLabel = `${channel} · ${clientLabel} · ${osLabel}`;
  const fingerprint = buildDeviceFingerprintId({
    channel,
    clientType,
    osName,
    osVersion,
  });

  return {
    clientType,
    clientLabel,
    channel,
    platform,
    osName,
    osVersion,
    hardwareLabel,
    deviceName,
    platformOsLabel,
    fingerprint,
    userAgent: ua || "unknown",
  };
}

export function buildDeviceFingerprintId(input: {
  channel: DeviceChannel;
  clientType: string;
  osName: string;
  osVersion: string;
}): string {
  const prefix =
    input.channel === "Mobile"
      ? "mobile_app"
      : input.channel === "Desktop"
        ? "desktop_app"
        : input.channel === "Extension"
          ? EXTENSION_FINGERPRINT_PREFIX
          : "web_app";
  return `${prefix}-${normalize(input.clientType)}-${osFamilyToken(input.osName)}-${normalize(input.osVersion)}`;
}

function osFamilyToken(osName: string): string {
  const value = osName.trim().toLowerCase();
  if (value.includes("windows")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("ios") || value.includes("iphone") || value.includes("ipad")) return "ios";
  if (value.includes("android")) return "android";
  if (value.includes("linux")) return "linux";
  return normalize(osName);
}

function normalize(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9.]+/g, "");
  return normalized.length > 0 ? normalized.slice(0, 64) : "unknown";
}

function detectBrowserClient(ua: string): BrowserClientId {
  if (/YaBrowser\//iu.test(ua) || /yowser/iu.test(ua)) return "yandex";
  if (/Edg\//iu.test(ua)) return "edge";
  if (/OPR\//iu.test(ua) || /Opera\//iu.test(ua)) return "opera";
  if (/Vivaldi\//iu.test(ua)) return "vivaldi";
  if (/Tor\b/iu.test(ua)) return "tor";
  if (/Firefox\//iu.test(ua) || /FxiOS\//iu.test(ua)) return "firefox";
  if (/Chrome\//iu.test(ua) || /CriOS\//iu.test(ua) || /Chromium\//iu.test(ua)) return "chrome";
  if (/Safari\//iu.test(ua) && !/Chrome\//iu.test(ua) && !/CriOS\//iu.test(ua)) return "safari";
  return "web";
}

function detectHardware(ua: string): {
  platform: string;
  osName: string;
  osVersion: string;
  hardwareLabel: string;
} {
  if (/Windows NT 10\.0/iu.test(ua)) {
    const isWin11 = /Windows NT 10\.0;.*Win64/iu.test(ua);
    return {
      platform: "desktop",
      osName: isWin11 ? "Windows 11" : "Windows 10",
      osVersion: isWin11 ? "11" : "10",
      hardwareLabel: isWin11 ? "Windows 11" : "Windows 10",
    };
  }
  if (/Windows/iu.test(ua)) {
    return { platform: "desktop", osName: "Windows", osVersion: "unknown", hardwareLabel: "Windows" };
  }
  if (/Android/iu.test(ua)) {
    const version = ua.match(/Android\s+([\d.]+)/iu)?.[1] ?? "unknown";
    return {
      platform: "mobile",
      osName: "Android",
      osVersion: version,
      hardwareLabel: version === "unknown" ? "Android" : `Android ${version}`,
    };
  }
  if (/iPhone/iu.test(ua)) {
    const version = (ua.match(/OS\s+(\d+)[_.](\d+)/iu) ?? []).slice(1).join(".") || "unknown";
    return { platform: "mobile", osName: "iOS", osVersion: version, hardwareLabel: "iPhone" };
  }
  if (/iPad/iu.test(ua)) {
    const version = (ua.match(/OS\s+(\d+)[_.](\d+)/iu) ?? []).slice(1).join(".") || "unknown";
    return { platform: "mobile", osName: "iOS", osVersion: version, hardwareLabel: "iPad" };
  }
  if (/Macintosh|Mac OS X/iu.test(ua)) {
    const version = (ua.match(/Mac OS X\s+(\d+)[_.](\d+)(?:[_.](\d+))?/iu) ?? [])
      .slice(1)
      .filter(Boolean)
      .join(".");
    return {
      platform: "desktop",
      osName: "macOS",
      osVersion: version || "unknown",
      hardwareLabel: "macOS",
    };
  }
  if (/Linux/iu.test(ua)) {
    return { platform: "desktop", osName: "Linux", osVersion: "unknown", hardwareLabel: "Linux" };
  }
  return {
    platform: "unknown",
    osName: "unknown",
    osVersion: "unknown",
    hardwareLabel: "Device",
  };
}

export { OKKEY_SAAS_WEB_BASE_URL, EXTENSION_DEVICE_CHANNEL };
