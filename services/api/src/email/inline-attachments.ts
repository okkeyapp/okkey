import {
  OKKEY_MARK_CID,
  okkeyMarkInlineAttachment,
  type OkkeyMarkInlineAttachment,
} from "@okkey/email-templates";

import type { EmailInlineAttachment, EmailMessage } from "./service.ts";

export function messageReferencesOkkeyMarkCid(html: string): boolean {
  return html.includes(`cid:${OKKEY_MARK_CID}`);
}

/** Ensure transactional HTML that references the mark CID carries the inline PNG. */
export function withOkkeyMarkInlineAttachment(message: EmailMessage): EmailMessage {
  if (!messageReferencesOkkeyMarkCid(message.html)) {
    return message;
  }
  const existing = message.inlineAttachments ?? [];
  if (existing.some((item) => item.cid === OKKEY_MARK_CID)) {
    return message;
  }
  const mark: OkkeyMarkInlineAttachment = okkeyMarkInlineAttachment();
  const attachment: EmailInlineAttachment = {
    cid: mark.cid,
    filename: mark.filename,
    contentType: mark.contentType,
    contentBase64: mark.contentBase64,
  };
  return {
    ...message,
    inlineAttachments: [...existing, attachment],
  };
}

function encodeQuotedPrintableHeader(value: string): string {
  // RFC 2047-ish safe: keep ASCII printable; escape non-ASCII if ever present.
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Build a multipart/related MIME message suitable for SES Raw and similar APIs.
 * Inline attachments are referenced from HTML via `cid:` Content-IDs.
 */
export function buildRawMimeEmail(message: EmailMessage): Buffer {
  const prepared = withOkkeyMarkInlineAttachment(message);
  const attachments = prepared.inlineAttachments ?? [];
  const relatedBoundary = `okkey_related_${OKKEY_MARK_CID}`;
  const altBoundary = `okkey_alt_${OKKEY_MARK_CID}`;

  const lines: string[] = [];
  lines.push(`From: ${encodeQuotedPrintableHeader(prepared.from)}`);
  lines.push(`To: ${encodeQuotedPrintableHeader(prepared.to)}`);
  lines.push(`Subject: ${encodeQuotedPrintableHeader(prepared.subject)}`);
  lines.push("MIME-Version: 1.0");

  if (attachments.length === 0) {
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push("");
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(Buffer.from(prepared.text, "utf8").toString("base64"));
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(Buffer.from(prepared.html, "utf8").toString("base64"));
    lines.push(`--${altBoundary}--`);
    lines.push("");
    return Buffer.from(lines.join("\r\n"), "utf8");
  }

  lines.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"; type="multipart/alternative"`);
  lines.push("");
  lines.push(`--${relatedBoundary}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  lines.push("");
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(Buffer.from(prepared.text, "utf8").toString("base64"));
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(Buffer.from(prepared.html, "utf8").toString("base64"));
  lines.push(`--${altBoundary}--`);

  for (const attachment of attachments) {
    lines.push(`--${relatedBoundary}`);
    lines.push(`Content-Type: ${attachment.contentType}; name="${attachment.filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-ID: <${attachment.cid}>`);
    lines.push(`Content-Disposition: inline; filename="${attachment.filename}"`);
    lines.push("");
    lines.push(attachment.contentBase64);
  }

  lines.push(`--${relatedBoundary}--`);
  lines.push("");
  return Buffer.from(lines.join("\r\n"), "utf8");
}
