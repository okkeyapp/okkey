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
 * - `none` — strip the logo `<img>` (wordmark text remains); omit `inlineAttachments`.
 * - `url` — rewrite logo `src` to `EMAIL_LOGO_URL` (https); omit `inlineAttachments`.
 */
export type EmailHttpApiInlineMode = "cid" | "data" | "none" | "url";

export const EMAIL_HTTP_API_INLINE_MODES: readonly EmailHttpApiInlineMode[] = [
  "cid",
  "data",
  "none",
  "url",
] as const;

/**
 * Accept only absolute https logo URLs (no `javascript:`, `data:`, relative paths).
 * Rejects credentials in the URL and non-http(s) schemes.
 */
export function isSafeEmailLogoUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  if (!parsed.hostname) {
    return false;
  }
  return true;
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
