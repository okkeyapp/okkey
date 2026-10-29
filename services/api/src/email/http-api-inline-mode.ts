/**
 * `EMAIL_HTTP_API_INLINE` / `EMAIL_LOGO_URL` parsing.
 * Kept free of `@okkey/email-templates` so `loadConfig` / crypto-policy tests
 * do not require `yarn build:email`.
 */

/**
 * How `EMAIL_PROVIDER=http-api` embeds the Okkey mark when HTML references `cid:okkey-mark`.
 *
 * - `cid` (default) — keep `cid:` in HTML and send `inlineAttachments` (remote must honor them).
 * - `data` — rewrite logo `src` to a `data:image/png;base64,…` URI; omit `inlineAttachments`.
 *   Many webmail clients block `data:` images; use only when the webhook consumer needs it.
 * - `none` — strip the logo `<img>` and its table cell (wordmark text remains); omit `inlineAttachments`.
 * - `url` — rewrite logo `src` to `EMAIL_LOGO_URL` (https); omit `inlineAttachments`.
 */
export type EmailHttpApiInlineMode = "cid" | "data" | "none" | "url";

export const EMAIL_HTTP_API_INLINE_MODES: readonly EmailHttpApiInlineMode[] = [
  "cid",
  "data",
  "none",
  "url",
] as const;

/** Characters that must not appear in a logo URL before parsing (attribute-break / injection). */
const UNSAFE_LOGO_URL_CHARS_RE = /[\s"'<>\\\r\n\0]/;

function isLoopbackOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
    return true;
  }
  // IPv4-mapped IPv6 loopback
  if (host === "::ffff:127.0.0.1") {
    return true;
  }
  return false;
}

/**
 * Normalize and validate `EMAIL_LOGO_URL`.
 * Returns canonical `URL.href` on success, otherwise `null`.
 *
 * Rejects non-https, credentials, loopback hosts, and raw strings that contain
 * whitespace or HTML-attribute-breaking characters (even if `new URL` would accept them).
 */
export function normalizeEmailLogoUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // Fail closed on raw characters that can break out of an HTML attribute even
  // when WHATWG URL parsing would percent-encode them into the path.
  if (UNSAFE_LOGO_URL_CHARS_RE.test(trimmed)) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  if (!parsed.hostname) {
    return null;
  }
  if (isLoopbackOrLocalHostname(parsed.hostname)) {
    return null;
  }
  // Prefer the serializer's href so callers never re-emit the untrusted raw string.
  const href = parsed.href;
  if (!href.startsWith("https://") || UNSAFE_LOGO_URL_CHARS_RE.test(href)) {
    return null;
  }
  return href;
}

/**
 * Accept only absolute public https logo URLs (no `javascript:`, `data:`, relative paths,
 * credentials, or loopback hosts).
 */
export function isSafeEmailLogoUrl(raw: string): boolean {
  return normalizeEmailLogoUrl(raw) !== null;
}

/** Escape a value for use inside a double- or single-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function parseEmailHttpApiInlineMode(
  raw: string | undefined,
): EmailHttpApiInlineMode {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized) {
    return "cid";
  }
  if ((EMAIL_HTTP_API_INLINE_MODES as readonly string[]).includes(normalized)) {
    return normalized as EmailHttpApiInlineMode;
  }
  throw new Error(
    `EMAIL_HTTP_API_INLINE must be one of ${EMAIL_HTTP_API_INLINE_MODES.join("|")} (got ${JSON.stringify(raw)})`,
  );
}
