import { DEVICE_FINGERPRINT_KEY } from "./storageKeys";

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBytesBrowser(len: number): Uint8Array {
  const out = new Uint8Array(len);
  crypto.getRandomValues(out);
  return out;
}

/** 64 lowercase hex chars (32 random bytes), stable per browser profile. */
export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === "undefined") {
    return "0".repeat(64);
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      return "0".repeat(64);
    }
    const existing = storage.getItem(DEVICE_FINGERPRINT_KEY);
    if (existing && /^[0-9a-f]{64}$/i.test(existing)) {
      return existing.toLowerCase();
    }
    const hex = bytesToHex(randomBytesBrowser(32));
    storage.setItem(DEVICE_FINGERPRINT_KEY, hex);
    return hex;
  } catch {
    return "0".repeat(64);
  }
}
