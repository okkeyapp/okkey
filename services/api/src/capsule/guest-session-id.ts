/**
 * Guest approval tokens issued by the public capsule page:
 * a UUID, or a `guest-…` fallback / fixture token.
 * Checked before any database query.
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const GUEST_SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `guest-` plus 8–120 letters, digits, or hyphens (no whitespace or controls). */
const GUEST_SESSION_TOKEN_RE = /^guest-[a-z0-9-]{8,120}$/i;

export type GuestSessionIdParse =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "value"; id: string };

export function isGuestSessionId(value: string): boolean {
  if (value.length === 0 || CONTROL_CHARS.test(value)) {
    return false;
  }
  return GUEST_SESSION_UUID_RE.test(value) || GUEST_SESSION_TOKEN_RE.test(value);
}

/** Classify a raw guest session id (not yet read from a URL). */
export function parseGuestSessionId(value: string | undefined | null): GuestSessionIdParse {
  if (value == null) {
    return { kind: "absent" };
  }
  if (CONTROL_CHARS.test(value)) {
    return { kind: "invalid" };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: "absent" };
  }
  if (!isGuestSessionId(trimmed)) {
    return { kind: "invalid" };
  }
  return { kind: "value", id: trimmed };
}

/** Read `guestSessionId` from a request URL. Invalid encoding is rejected. */
export function readGuestSessionIdQuery(url: string | undefined): GuestSessionIdParse {
  try {
    const raw = new URL(url ?? "/", "http://localhost").searchParams.get("guestSessionId");
    if (raw === null) {
      return { kind: "absent" };
    }
    return parseGuestSessionId(raw);
  } catch {
    return { kind: "invalid" };
  }
}
