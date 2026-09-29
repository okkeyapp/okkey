/**
 * Extension device identity helpers (E0 scaffold).
 * Full parseBrowserEnvironment lives in apps/web today; extract to a shared
 * package happens with auth/device work (E1). Until then, keep channel +
 * fingerprint prefix aligned with the product plan.
 */

export const EXTENSION_DEVICE_CHANNEL = "Extension" as const;

/** SaaS web base URL preset — reserved for E1 server-URL UI. */
export const OKKEY_SAAS_WEB_BASE_URL = "https://okkey.app";

/**
 * Fingerprint prefix for extension devices (`extension-…`), distinct from
 * `web_app-…` / `mobile_app-…` / `desktop_app-…`.
 */
export const EXTENSION_FINGERPRINT_PREFIX = "extension";

export function buildExtensionFingerprintStub(parts: {
  clientType: string;
  osName: string;
  osVersion: string;
}): string {
  const normalize = (value: string): string => {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9.]+/g, "");
    return normalized.length > 0 ? normalized.slice(0, 64) : "unknown";
  };

  const osFamily = (() => {
    const value = parts.osName.trim().toLowerCase();
    if (value.includes("windows")) return "windows";
    if (value.includes("mac")) return "macos";
    if (value.includes("ios") || value.includes("iphone") || value.includes("ipad")) return "ios";
    if (value.includes("android")) return "android";
    if (value.includes("linux")) return "linux";
    return normalize(parts.osName);
  })();

  return `${EXTENSION_FINGERPRINT_PREFIX}-${normalize(parts.clientType)}-${osFamily}-${normalize(parts.osVersion)}`;
}
