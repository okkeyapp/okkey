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
  /** Stored as `client_type` — browser id for web, or mobile/desktop/extension. */
  clientType: string;
  clientLabel: string;
  channel: DeviceChannel;
  platform: string;
  osName: string;
  osVersion: string;
  /** Hardware / OS model we can actually detect: macOS, Windows 11, iPhone, Android, … */
  hardwareLabel: string;
  /** Full display title: `Web macOS - Chrome`. */
  deviceName: string;
  /** Subtitle: `Chrome · macOS`. */
  platformOsLabel: string;
  /**
   * Stable device identity (no IP/geo):
   * `{web_app|mobile_app|desktop_app|extension}-{browser|device}-{os}-{os_version}`
   */
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

/**
 * Parse browser + OS from a User-Agent string for device registration metadata.
 * Order matters: Edge/Opera/Yandex identify as Chrome-compatible.
 */
export function parseBrowserEnvironment(userAgent = ""): ParsedBrowserEnvironment {
  const ua = userAgent.trim();
  const browserId = detectBrowserClient(ua);
  const { platform, osName, osVersion, hardwareLabel } = detectHardware(ua);
  const channel = detectChannel(platform, browserId);
  const clientLabel =
    channel === "Web" || channel === "Extension" || channel === "Mobile"
      ? CLIENT_LABELS[browserId]
      : "App";
  // Keep real browser id on mobile web too — needed for per-browser device identity.
  const clientType =
    channel === "Desktop" && browserId === "web"
      ? "desktop"
      : browserId === "web"
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

export function formatClientLabelFromType(clientType: string): string {
  const value = clientType.trim().toLowerCase();
  if (!value || value === "unknown") return "App";
  if (value.includes("extension")) return "Extension";
  if (value in CLIENT_LABELS) return CLIENT_LABELS[value as BrowserClientId];
  if (value === "web" || value.includes("browser")) return "Web";
  if (value.includes("mobile")) return "App";
  if (value.includes("desktop")) return "App";
  return clientType;
}

/** Infer OS label from a device_name that may embed a raw User-Agent. */
export function parseOsFromDeviceName(deviceName: string): string | null {
  const value = deviceName;
  if (/Windows\s*11/iu.test(value)) return "Windows 11";
  if (/Windows\s*10/iu.test(value)) return "Windows 10";
  if (/Windows\s*7/iu.test(value)) return "Windows 7";
  if (/Windows/iu.test(value)) return "Windows";
  if (/Android/iu.test(value)) return "Android";
  if (/iPhone/iu.test(value)) return "iPhone";
  if (/iPad/iu.test(value)) return "iPad";
  if (/MacBook/iu.test(value)) return "MacBook";
  if (/iMac/iu.test(value)) return "iMac";
  if (/Macintosh|Mac OS|macOS/iu.test(value)) return "macOS";
  if (/Linux/iu.test(value)) return "Linux";
  return null;
}

function isUnknownMeta(value: string | null | undefined): boolean {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return !trimmed || trimmed === "unknown";
}

function looksLikeUserAgent(value: string): boolean {
  return /Mozilla\/\d/iu.test(value) || /AppleWebKit\//iu.test(value);
}

export type DeviceDisplayHints = {
  device_name?: string | null;
  client_type?: string | null;
  os_name?: string | null;
  platform?: string | null;
  user_agent?: string | null;
};

/**
 * Subtitle like `Web · Chrome · macOS`.
 * Prefers stored fields; falls back to parsing UA / legacy device_name.
 */
export function formatDeviceClientOs(device: DeviceDisplayHints): string {
  const name = device.device_name?.trim() ?? "";
  if (name && !looksLikeUserAgent(name) && /\s-\s/.test(name)) {
    // Full title already stored — rebuild subtitle from metadata / UA.
  }

  const uaHint = [device.user_agent, looksLikeUserAgent(name) ? name : ""].filter(Boolean).join(" ");
  const parsed = uaHint ? parseBrowserEnvironment(uaHint) : null;

  let client = formatClientLabelFromType(device.client_type ?? "");
  if ((client === "Web" || client === "App") && parsed) {
    client = parsed.clientLabel;
  }

  const osFromFields = !isUnknownMeta(device.os_name) ? device.os_name! : null;
  const os =
    osFromFields ??
    (parsed && parsed.osName !== "unknown" ? parsed.osName : null) ??
    (name ? parseOsFromDeviceName(name) : null) ??
    "unknown";

  const channel = formatDeviceChannel(device, parsed);
  return `${channel} · ${client} · ${os}`;
}

export function formatDeviceChannel(
  device: DeviceDisplayHints,
  parsed: ParsedBrowserEnvironment | null = null,
): DeviceChannel {
  if (parsed) {
    return parsed.channel;
  }
  const name = device.device_name?.trim() ?? "";
  const fromName = name.match(/^(Web|Mobile|Desktop|Extension)\b/u);
  if (fromName?.[1]) {
    return fromName[1] as DeviceChannel;
  }
  const clientType = device.client_type?.trim().toLowerCase() ?? "";
  if (clientType.includes("extension")) return "Extension";
  if (device.platform === "mobile" || clientType.includes("mobile")) return "Mobile";
  if (clientType === "desktop") return "Desktop";
  return "Web";
}

function looksLikeFullDeviceTitle(value: string): boolean {
  return /^(Web|Mobile|Desktop|Extension)\s+\S.+\s-\s\S.+$/u.test(value);
}

/**
 * Primary title: `Web macOS - Chrome`.
 * Uses stored device_name when it already matches the pattern; otherwise rebuilds.
 */
export function formatDeviceTitle(device: DeviceDisplayHints): string {
  const name = device.device_name?.trim() ?? "";
  const uaHint = [device.user_agent, looksLikeUserAgent(name) ? name : ""].filter(Boolean).join(" ");

  // User rename (or any non-auto label) wins over UA reconstruction.
  if (
    name &&
    !looksLikeUserAgent(name) &&
    !isAutoGeneratedDeviceTitle(name) &&
    !looksLikeFullDeviceTitle(name) &&
    !isLegacyOsOnlyLabel(name)
  ) {
    return name;
  }

  // Prefer live UA over outdated auto-titles that guessed MacBook/iMac.
  if (uaHint && (!name || looksLikeUserAgent(name) || isAutoGeneratedDeviceTitle(name))) {
    return parseBrowserEnvironment(uaHint).deviceName;
  }

  if (name && !looksLikeUserAgent(name) && looksLikeFullDeviceTitle(name)) {
    return name;
  }
  if (uaHint) {
    return parseBrowserEnvironment(uaHint).deviceName;
  }
  if (!isUnknownMeta(device.os_name) || !isUnknownMeta(device.client_type) || !isUnknownMeta(device.platform)) {
    const channel =
      device.platform === "mobile"
        ? "Mobile"
        : device.client_type?.toLowerCase().includes("extension")
          ? "Extension"
          : device.client_type?.toLowerCase() === "desktop"
            ? "Desktop"
            : "Web";
    const rawHardware =
      (!isUnknownMeta(device.os_name) ? device.os_name! : null) ??
      (name ? parseOsFromDeviceName(name) : null) ??
      "Device";
    const client = formatClientLabelFromType(device.client_type ?? "");
    return `${channel} ${rawHardware} - ${client}`;
  }
  if (name) {
    return name;
  }
  return parseBrowserEnvironment("").deviceName;
}

/** Titles we auto-built (not user renames) — safe to refresh from UA. */
function isAutoGeneratedDeviceTitle(value: string): boolean {
  return /^(Web|Mobile|Desktop|Extension)\s+(macOS|MacBook|iMac|Windows(?:\s+\d+(?:\.\d+)?)?|Linux|Android(?:\s+[\d.]+)?|iPhone|iPad|Device)\s-\s.+$/u.test(
    value,
  );
}

function isLegacyOsOnlyLabel(value: string): boolean {
  return /^(macOS|Mac OS X?|Windows(?:\s+\d+)?|Linux|Android|iPhone|iPad|iMac|MacBook)$/iu.test(
    value.trim(),
  );
}

function detectChannel(platform: string, _browserId: BrowserClientId): DeviceChannel {
  if (platform === "mobile") return "Mobile";
  return "Web";
}

/**
 * Build stable device fingerprint from environment.
 * IP / country / city must never be part of this identity.
 */
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
          ? "extension"
          : "web_app";
  const browserOrDevice = normalizeFingerprintPart(input.clientType);
  const os = osFamilyToken(input.osName);
  const version = normalizeFingerprintPart(input.osVersion);
  return `${prefix}-${browserOrDevice}-${os}-${version}`;
}

function osFamilyToken(osName: string): string {
  const value = osName.trim().toLowerCase();
  if (value.includes("windows")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("ios") || value.includes("iphone") || value.includes("ipad")) return "ios";
  if (value.includes("android")) return "android";
  if (value.includes("linux")) return "linux";
  return normalizeFingerprintPart(osName);
}

function normalizeFingerprintPart(value: string): string {
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
  if (/Windows NT 6\.1/iu.test(ua)) {
    return { platform: "desktop", osName: "Windows 7", osVersion: "7", hardwareLabel: "Windows 7" };
  }
  if (/Windows NT 6\.3/iu.test(ua)) {
    return {
      platform: "desktop",
      osName: "Windows 8.1",
      osVersion: "8.1",
      hardwareLabel: "Windows 8.1",
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
    return {
      platform: "mobile",
      osName: "iOS",
      osVersion: version,
      hardwareLabel: "iPhone",
    };
  }
  if (/iPad/iu.test(ua)) {
    const version = (ua.match(/OS\s+(\d+)[_.](\d+)/iu) ?? []).slice(1).join(".") || "unknown";
    return {
      platform: "mobile",
      osName: "iOS",
      osVersion: version,
      hardwareLabel: "iPad",
    };
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
      // UA cannot distinguish MacBook vs iMac, and never exposes computer hostname.
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
