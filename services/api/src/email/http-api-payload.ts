import {
  OKKEY_MARK_CID,
  OKKEY_MARK_CONTENT_TYPE,
  OKKEY_MARK_PNG_BASE64,
} from "@okkey/email-templates";

import { withOkkeyMarkInlineAttachment } from "./inline-attachments.ts";

/** Structural email payload (avoids importing `service.ts` and creating a cycle). */
export type HttpApiEmailMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  inlineAttachments?: Array<{
    cid: string;
    filename: string;
    contentType: string;
    contentBase64: string;
  }>;
};

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

export type PrepareHttpApiEmailPayloadOptions = {
  inlineMode: EmailHttpApiInlineMode;
  /** Required when `inlineMode` is `url`. Must be an absolute https URL. */
  logoUrl?: string;
};

/** Match `<img … src="cid:okkey-mark" …>` (single- or double-quoted src). */
const OKKEY_MARK_IMG_RE = new RegExp(
  `<img\\b[^>]*\\bsrc=(["'])cid:${OKKEY_MARK_CID}\\1[^>]*(?:\\/\\s*>|>)`,
  "gi",
);

const OKKEY_MARK_CID_SRC_RE = new RegExp(
  `src=(["'])cid:${OKKEY_MARK_CID}\\1`,
  "gi",
);

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

function stripInlineAttachments(message: HttpApiEmailMessage): HttpApiEmailMessage {
  const { inlineAttachments: _omit, ...rest } = message;
  void _omit;
  return rest;
}

/**
 * Shape the JSON body for `HttpApiEmailSender` according to `EMAIL_HTTP_API_INLINE`.
 * SMTP/SES keep CID MIME attachments; only the generic HTTP webhook adapts.
 */
export function prepareHttpApiEmailPayload(
  message: HttpApiEmailMessage,
  options: PrepareHttpApiEmailPayloadOptions,
): HttpApiEmailMessage {
  switch (options.inlineMode) {
    case "cid":
      return withOkkeyMarkInlineAttachment(message);
    case "data": {
      const dataSrc = `data:${OKKEY_MARK_CONTENT_TYPE};base64,${OKKEY_MARK_PNG_BASE64}`;
      const rewritten = message.html.replace(
        OKKEY_MARK_CID_SRC_RE,
        (_match, quote: string) => `src=${quote}${dataSrc}${quote}`,
      );
      return stripInlineAttachments({ ...message, html: rewritten });
    }
    case "none": {
      const rewritten = message.html.replace(OKKEY_MARK_IMG_RE, "");
      return stripInlineAttachments({ ...message, html: rewritten });
    }
    case "url": {
      const logoUrl = (options.logoUrl ?? "").trim();
      if (!isSafeEmailLogoUrl(logoUrl)) {
        throw new Error(
          "EMAIL_LOGO_URL must be an absolute https URL when EMAIL_HTTP_API_INLINE=url",
        );
      }
      const rewritten = message.html.replace(
        OKKEY_MARK_CID_SRC_RE,
        (_match, quote: string) => `src=${quote}${logoUrl}${quote}`,
      );
      return stripInlineAttachments({ ...message, html: rewritten });
    }
    default: {
      const _exhaustive: never = options.inlineMode;
      throw new Error(`unsupported EMAIL_HTTP_API_INLINE: ${_exhaustive}`);
    }
  }
}
