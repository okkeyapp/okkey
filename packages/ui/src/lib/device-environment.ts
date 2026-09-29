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
  /** Short display title: `Web Chrome`, `Extension Chrome`, `Desktop macOS`, `Mobile iOS`. */
  deviceName: string;
  /** Subtitle: `Web · Chrome · macOS`. */
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

export type ParseBrowserEnvironmentOptions = {
  /**
   * Force device channel. UA alone cannot distinguish an extension from web —
   * callers in the extension must pass `channel: "Extension"` so fingerprints
   * use the `extension-…` prefix instead of `web_app-…`.
   */
  channel?: DeviceChannel;
};

/**
 * Short default device names (until the user renames):
 * - Web / Extension → `{Channel} {Browser}`
 * - Desktop / Mobile → `{Channel} {OS}`
 */
export function buildDefaultDeviceName(input: {
  channel: DeviceChannel;
  clientLabel: string;
  osName: string;
  hardwareLabel: string;
}): string {
  if (input.channel === "Web" || input.channel === "Extension") {
    return `${input.channel} ${input.clientLabel}`;
  }
  const osLabel = resolveChannelOsLabel(input.channel, input.osName, input.hardwareLabel);
  return `${input.channel} ${osLabel}`;
}

function resolveChannelOsLabel(channel: DeviceChannel, osName: string, hardwareLabel: string): string {
  if (channel === "Mobile") {
    const value = `${osName} ${hardwareLabel}`.toLowerCase();
    if (value.includes("android")) return "Android";
    if (
      value.includes("ios") ||
      value.includes("iphone") ||
      value.includes("ipad") ||
      hardwareLabel === "iPhone" ||
      hardwareLabel === "iPad"
    ) {
      return "iOS";
    }
  }
  if (osName !== "unknown" && osName.trim()) {
    return osName;
  }
  return hardwareLabel || "Device";
}

/**
 * Parse browser + OS from a User-Agent string for device registration metadata.
 * Order matters: Edge/Opera/Yandex identify as Chrome-compatible.
 */
export function parseBrowserEnvironment(
  userAgent = "",
  options: ParseBrowserEnvironmentOptions = {},
): ParsedBrowserEnvironment {
  const ua = userAgent.trim();
  const browserId = detectBrowserClient(ua);
  const { platform, osName, osVersion, hardwareLabel } = detectHardware(ua);
  const channel = options.channel ?? detectChannel(platform, browserId);
  const clientLabel =
    channel === "Web" || channel === "Extension" || channel === "Mobile"
      ? CLIENT_LABELS[browserId]
      : "App";
  const clientType =
    channel === "Desktop" && browserId === "web"
      ? "desktop"
      : browserId === "web"
        ? channel === "Extension"
          ? "extension"
          : "web"
        : browserId;

  const deviceName = buildDefaultDeviceName({
    channel,
    clientLabel,
    osName,
    hardwareLabel,
  });
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
  device_fingerprint?: string | null;
};

/**
 * Subtitle like `Web · Chrome · macOS`.
 * Prefers stored fields; falls back to parsing UA / legacy device_name.
 * Channel prefers fingerprint / device_name over UA (UA cannot see Extension).
 */
export function formatDeviceClientOs(device: DeviceDisplayHints): string {
  const name = device.device_name?.trim() ?? "";
  const uaHint = [device.user_agent, looksLikeUserAgent(name) ? name : ""].filter(Boolean).join(" ");
  const channel = formatDeviceChannel(device);
  const parsed = uaHint ? parseBrowserEnvironment(uaHint, { channel }) : null;

  let client = formatClientLabelFromType(device.client_type ?? "");
  if ((client === "Web" || client === "App") && parsed) {
    client = parsed.clientLabel;
  }
  if (channel === "Desktop" || channel === "Mobile") {
    // Subtitle still shows browser/app label when known.
  }

  const osFromFields = !isUnknownMeta(device.os_name) ? device.os_name! : null;
  const os =
    osFromFields ??
    (parsed && parsed.osName !== "unknown" ? parsed.osName : null) ??
    (name ? parseOsFromDeviceName(name) : null) ??
    "unknown";

  return `${channel} · ${client} · ${os}`;
}

export function formatDeviceChannel(
  device: DeviceDisplayHints,
  parsed: ParsedBrowserEnvironment | null = null,
): DeviceChannel {
  const fingerprint = device.device_fingerprint?.trim().toLowerCase() ?? "";
  if (fingerprint.startsWith("extension-")) return "Extension";
  if (fingerprint.startsWith("mobile_app-")) return "Mobile";
  if (fingerprint.startsWith("desktop_app-")) return "Desktop";
  if (fingerprint.startsWith("web_app-")) return "Web";

  const name = device.device_name?.trim() ?? "";
  const fromName = name.match(/^(Web|Mobile|Desktop|Extension)\b/u);
  if (fromName?.[1]) {
    return fromName[1] as DeviceChannel;
  }

  const clientType = device.client_type?.trim().toLowerCase() ?? "";
  if (clientType.includes("extension")) return "Extension";
  if (device.platform === "mobile" || clientType.includes("mobile")) return "Mobile";
  if (clientType === "desktop") return "Desktop";

  // UA parse last — it cannot distinguish Extension from Web.
  if (parsed) {
    return parsed.channel;
  }
  return "Web";
}

function looksLikeLegacyLongDeviceTitle(value: string): boolean {
  return /^(Web|Mobile|Desktop|Extension)\s+\S.+\s-\s\S.+$/u.test(value);
}

function looksLikeShortDeviceTitle(value: string): boolean {
  return /^(Web|Extension)\s+[A-Za-z][\w.-]*$/u.test(value) || /^(Mobile|Desktop)\s+\S.+$/u.test(value);
}

/** Titles we auto-built (not user renames) — safe to refresh from UA / metadata. */
export function isAutoGeneratedDeviceTitle(value: string): boolean {
  if (looksLikeShortDeviceTitle(value)) {
    return true;
  }
  return /^(Web|Mobile|Desktop|Extension)\s+(macOS|MacBook|iMac|Windows(?:\s+\d+(?:\.\d+)?)?|Linux|Android(?:\s+[\d.]+)?|iPhone|iPad|iOS|Device)\s-\s.+$/u.test(
    value,
  );
}

function isLegacyOsOnlyLabel(value: string): boolean {
  return /^(macOS|Mac OS X?|Windows(?:\s+\d+)?|Linux|Android|iPhone|iPad|iMac|MacBook)$/iu.test(
    value.trim(),
  );
}

function shortenLegacyDeviceTitle(name: string): string | null {
  const browser = name.match(/^(Web|Extension)\s+.+\s-\s(.+)$/u);
  if (browser) {
    return `${browser[1]} ${browser[2]}`;
  }
  const osChannel = name.match(/^(Desktop|Mobile)\s+(.+)\s-\s.+$/u);
  if (osChannel) {
    const channel = osChannel[1] as DeviceChannel;
    const rawOs = osChannel[2];
    return buildDefaultDeviceName({
      channel,
      clientLabel: "App",
      osName: rawOs,
      hardwareLabel: rawOs,
    });
  }
  return null;
}

/**
 * Primary title: `Web Chrome` / `Extension Chrome` / `Desktop macOS` / `Mobile iOS`.
 * Uses stored device_name when it is a user rename; otherwise rebuilds short defaults.
 */
export function formatDeviceTitle(device: DeviceDisplayHints): string {
  const name = device.device_name?.trim() ?? "";
  const uaHint = [device.user_agent, looksLikeUserAgent(name) ? name : ""].filter(Boolean).join(" ");
  const channel = formatDeviceChannel(device);

  // User rename (or any non-auto label) wins over UA reconstruction.
  if (
    name &&
    !looksLikeUserAgent(name) &&
    !isAutoGeneratedDeviceTitle(name) &&
    !looksLikeLegacyLongDeviceTitle(name) &&
    !isLegacyOsOnlyLabel(name)
  ) {
    return name;
  }

  if (uaHint && (!name || looksLikeUserAgent(name) || isAutoGeneratedDeviceTitle(name))) {
    return parseBrowserEnvironment(uaHint, { channel }).deviceName;
  }

  if (name && !looksLikeUserAgent(name) && looksLikeLegacyLongDeviceTitle(name)) {
    return shortenLegacyDeviceTitle(name) ?? name;
  }

  if (name && !looksLikeUserAgent(name) && looksLikeShortDeviceTitle(name)) {
    return name;
  }

  if (uaHint) {
    return parseBrowserEnvironment(uaHint, { channel }).deviceName;
  }

  if (!isUnknownMeta(device.os_name) || !isUnknownMeta(device.client_type) || !isUnknownMeta(device.platform)) {
    const client = formatClientLabelFromType(device.client_type ?? "");
    const rawHardware =
      (!isUnknownMeta(device.os_name) ? device.os_name! : null) ??
      (name ? parseOsFromDeviceName(name) : null) ??
      "Device";
    return buildDefaultDeviceName({
      channel,
      clientLabel: client === "App" && (channel === "Web" || channel === "Extension") ? "Web" : client,
      osName: rawHardware,
      hardwareLabel: rawHardware,
    });
  }

  if (name) {
    return shortenLegacyDeviceTitle(name) ?? name;
  }
  return parseBrowserEnvironment("", { channel }).deviceName;
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
