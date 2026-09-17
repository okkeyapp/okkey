import { parseBrowserEnvironment } from "./browserEnvironment";
import { DEVICE_FINGERPRINT_KEY } from "./storageKeys";

/**
 * Stable per browser/OS identity for device trust.
 * Format: `{web_app|mobile_app|desktop_app|extension}-{browser}-{os}-{os_version}`
 * Never includes IP / geo (VPN-safe).
 */
export function getOrCreateDeviceFingerprint(): string {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const fingerprint = parseBrowserEnvironment(userAgent).fingerprint;

  if (typeof window !== "undefined") {
    try {
      const storage = window.localStorage;
      if (storage && typeof storage.setItem === "function") {
        // Refresh cache for debugging / older readers; source of truth is UA parse.
        storage.setItem(DEVICE_FINGERPRINT_KEY, fingerprint);
      }
    } catch {
      /* private mode / quota */
    }
  }

  return fingerprint;
}

/** Legacy random hex fingerprints (pre structured id). */
export function isLegacyHexFingerprint(value: string): boolean {
  return /^[a-f0-9]{32,128}$/i.test(value.trim());
}
