/**
 * Guest session ids for public capsule approval.
 * Must match server acceptance in services/api capsule guest-session-id.
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const GUEST_SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `guest-` plus 8–120 letters, digits, or hyphens (no whitespace or controls). */
const GUEST_SESSION_TOKEN_RE = /^guest-[a-z0-9-]{8,120}$/i;

export class GuestSessionCryptoUnavailableError extends Error {
  constructor() {
    super("Web Crypto is required to create a guest session id");
    this.name = "GuestSessionCryptoUnavailableError";
  }
}

export function isGuestSessionId(value: string): boolean {
  if (value.length === 0 || CONTROL_CHARS.test(value)) {
    return false;
  }
  return GUEST_SESSION_UUID_RE.test(value) || GUEST_SESSION_TOKEN_RE.test(value);
}

export function guestSessionStorageKey(capsuleId: string): string {
  return `okkey:capsule-guest:${capsuleId}`;
}

function uuidV4FromRandomValues(getRandomValues: Crypto["getRandomValues"]): string {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  // RFC 4122 version 4 + variant 10xxxxxx
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function defaultCryptoApi(): Crypto | null {
  return typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
}

/**
 * Create a new guest session id using Web Crypto only (UUID v4).
 * Pass `null` (or an object without randomUUID/getRandomValues) when Web Crypto is unavailable.
 */
export function createGuestSessionId(cryptoApi: Crypto | null = defaultCryptoApi()): string {
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    return uuidV4FromRandomValues(cryptoApi.getRandomValues.bind(cryptoApi));
  }
  throw new GuestSessionCryptoUnavailableError();
}

/**
 * Reuse a valid stored guest session id, or create one with Web Crypto.
 * Invalid stored values are replaced. Never uses Math.random.
 * Pass `null` as `cryptoApi` to simulate missing Web Crypto.
 */
export function getOrCreateGuestSessionId(
  capsuleId: string,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
  cryptoApi: Crypto | null = defaultCryptoApi(),
): string {
  const key = guestSessionStorageKey(capsuleId);
  const existing = storage.getItem(key)?.trim();
  if (existing && isGuestSessionId(existing)) {
    return existing;
  }
  const created = createGuestSessionId(cryptoApi);
  storage.setItem(key, created);
  return created;
}
