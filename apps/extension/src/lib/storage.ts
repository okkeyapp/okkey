/** chrome.storage.local profile + session for the extension (one active profile). */

export const STORAGE_KEYS = {
  profile: "okkey.extension.profile",
  session: "okkey.extension.session",
  pkce: "okkey.extension.pkce",
  devicePublicKey: "okkey.extension.devicePublicKey",
  deviceFingerprint: "okkey.extension.deviceFingerprint",
  deviceId: "okkey.extension.deviceId",
} as const;

export type ExtensionProfile = {
  /** Web base URL (origin). SaaS preset or manual. */
  webBaseUrl: string;
  /** Resolved API base URL (may differ on localhost). */
  apiBaseUrl: string;
  updatedAt: number;
};

export type ExtensionSession = {
  access_token: string;
  user_id: string;
  expires_at: string;
};

export type ExtensionPkcePending = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  webBaseUrl: string;
  apiBaseUrl: string;
  createdAt: number;
};

function storageArea(): typeof browser.storage.local {
  return browser.storage.local;
}

export async function readProfile(): Promise<ExtensionProfile | null> {
  const result = await storageArea().get(STORAGE_KEYS.profile);
  const raw = result[STORAGE_KEYS.profile] as ExtensionProfile | undefined;
  if (!raw?.webBaseUrl?.trim() || !raw?.apiBaseUrl?.trim()) {
    return null;
  }
  return raw;
}

export async function writeProfile(profile: ExtensionProfile): Promise<void> {
  await storageArea().set({ [STORAGE_KEYS.profile]: profile });
}

export async function readSession(): Promise<ExtensionSession | null> {
  const result = await storageArea().get(STORAGE_KEYS.session);
  const raw = result[STORAGE_KEYS.session] as ExtensionSession | undefined;
  if (!raw?.access_token?.trim() || !raw?.user_id?.trim()) {
    return null;
  }
  const exp = Date.parse(raw.expires_at);
  if (!Number.isFinite(exp) || Date.now() >= exp) {
    await clearSession();
    return null;
  }
  return raw;
}

export async function writeSession(session: ExtensionSession): Promise<void> {
  await storageArea().set({ [STORAGE_KEYS.session]: session });
}

export async function clearSession(): Promise<void> {
  await storageArea().remove(STORAGE_KEYS.session);
}

export async function readPkcePending(): Promise<ExtensionPkcePending | null> {
  const result = await storageArea().get(STORAGE_KEYS.pkce);
  const raw = result[STORAGE_KEYS.pkce] as ExtensionPkcePending | undefined;
  if (!raw?.state || !raw?.codeVerifier) {
    return null;
  }
  return raw;
}

export async function writePkcePending(pending: ExtensionPkcePending): Promise<void> {
  await storageArea().set({ [STORAGE_KEYS.pkce]: pending });
}

export async function clearPkcePending(): Promise<void> {
  await storageArea().remove(STORAGE_KEYS.pkce);
}

export async function readDevicePublicKey(): Promise<string | null> {
  const result = await storageArea().get(STORAGE_KEYS.devicePublicKey);
  const value = result[STORAGE_KEYS.devicePublicKey];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function writeDevicePublicKey(publicKeyB64: string): Promise<void> {
  await storageArea().set({ [STORAGE_KEYS.devicePublicKey]: publicKeyB64 });
}

export async function readDeviceFingerprint(): Promise<string | null> {
  const result = await storageArea().get(STORAGE_KEYS.deviceFingerprint);
  const value = result[STORAGE_KEYS.deviceFingerprint];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function writeDeviceFingerprint(fingerprint: string): Promise<void> {
  await storageArea().set({ [STORAGE_KEYS.deviceFingerprint]: fingerprint });
}

export async function readDeviceId(): Promise<string | null> {
  const result = await storageArea().get(STORAGE_KEYS.deviceId);
  const value = result[STORAGE_KEYS.deviceId];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function writeDeviceId(deviceId: string): Promise<void> {
  await storageArea().set({ [STORAGE_KEYS.deviceId]: deviceId });
}

/** Logout + wipe local profile cache (session, PKCE, device keys). Keeps nothing. */
export async function wipeAllExtensionData(): Promise<void> {
  await storageArea().remove([
    STORAGE_KEYS.profile,
    STORAGE_KEYS.session,
    STORAGE_KEYS.pkce,
    STORAGE_KEYS.devicePublicKey,
    STORAGE_KEYS.deviceFingerprint,
    STORAGE_KEYS.deviceId,
  ]);
}

/**
 * Resolve API base from a single web Base URL.
 * Localhost web → :4000 API; otherwise same origin (SaaS / same-host self-host).
 */
export function resolveApiBaseFromWebBase(webBaseUrl: string): string {
  const trimmed = webBaseUrl.trim().replace(/\/$/, "");
  const url = new URL(trimmed);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return `${url.protocol}//${url.hostname}:4000`;
  }
  return url.origin;
}

export function normalizeWebBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Base URL is required");
  }
  const withScheme = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must use http or https");
  }
  return url.origin;
}
