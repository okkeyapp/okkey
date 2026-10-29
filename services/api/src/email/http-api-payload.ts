import {
  OKKEY_MARK_CID,
  OKKEY_MARK_CONTENT_TYPE,
  OKKEY_MARK_PNG_BASE64,
} from "@okkey/email-templates";

import { withOkkeyMarkInlineAttachment } from "./inline-attachments.ts";
import type { EmailHttpApiInlineMode } from "./http-api-inline-mode.ts";
import { isSafeEmailLogoUrl } from "./http-api-inline-mode.ts";

export type {
  EmailHttpApiInlineMode,
} from "./http-api-inline-mode.ts";
export {
  EMAIL_HTTP_API_INLINE_MODES,
  isSafeEmailLogoUrl,
  parseEmailHttpApiInlineMode,
} from "./http-api-inline-mode.ts";

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
