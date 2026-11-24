import { parseBrowserEnvironment } from "./browserEnvironment";
import {
  DEVICE_FINGERPRINT_KEY,
  DEVICE_PRIVATE_KEY_KEY,
  DEVICE_PUBLIC_KEY_KEY,
  VAULT_BUNDLE_STORAGE_KEY,
} from "./storageKeys";

export { isLegacyHexFingerprint } from "@okkey/types";

/**
 * Per-install device identity for this browser profile.
 * The user-agent prefix stays `{web_app|mobile_app|desktop_app|extension}-{browser}-{os}-{os_version}`
 * and never includes IP or geo. A new profile appends a random install id so it is not
 * the same device as another profile on the same machine.
 * A profile that already registered the unsuffixed id keeps it.
 */
export function getOrCreateDeviceFingerprint(): string {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const coarse = parseBrowserEnvironment(userAgent).fingerprint;

  if (typeof window === "undefined") {
    return coarse;
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      return coarse;
    }
    const stored = storage.getItem(DEVICE_FINGERPRINT_KEY)?.trim().toLowerCase() ?? "";
    if (stored && stored !== coarse && isPersistedFingerprint(stored)) {
      return stored;
    }
    if (profileOwnsRegisteredDevice(storage)) {
      if (stored !== coarse) {
        storage.setItem(DEVICE_FINGERPRINT_KEY, coarse);
      }
      return coarse;
    }
    const created = `${coarse}.${randomInstallId()}`;
    storage.setItem(DEVICE_FINGERPRINT_KEY, created);
    return created;
  } catch {
    return coarse;
  }
}

function isPersistedFingerprint(value: string): boolean {
  if (/^[a-f0-9]{32,128}$/i.test(value)) {
    return true;
  }
  return /^(web_app|mobile_app|desktop_app|extension)-[a-z0-9]+-[a-z0-9]+-[a-z0-9.]+$/i.test(value);
}

/** Vault material or a legacy device key means this profile already registered. */
function profileOwnsRegisteredDevice(storage: Pick<Storage, "getItem" | "key" | "length">): boolean {
  if (storage.getItem(VAULT_BUNDLE_STORAGE_KEY)) {
    return true;
  }
  if (storage.getItem(DEVICE_PUBLIC_KEY_KEY) || storage.getItem(DEVICE_PRIVATE_KEY_KEY)) {
    return true;
  }
  const prefix = `${VAULT_BUNDLE_STORAGE_KEY}.u.`;
  const length = storage.length ?? 0;
  if (typeof storage.key !== "function") {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function randomInstallId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
