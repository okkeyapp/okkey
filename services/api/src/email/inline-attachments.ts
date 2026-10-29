import { randomBytes } from "node:crypto";

import {
  OKKEY_MARK_CID,
  okkeyMarkInlineAttachment,
  type OkkeyMarkInlineAttachment,
} from "@okkey/email-templates";

import type { EmailInlineAttachment, EmailMessage } from "./service.ts";

/** RFC 2045 base64 line length (soft wrap). Hard limit elsewhere is 998. */
const BASE64_LINE_LENGTH = 76;

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

/** Strip CR/LF (header injection) and collapse runs of whitespace. */
function sanitizeHeaderText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function isAsciiPrintable(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }
  return true;
}

/**
 * RFC 2047 encoded-word(s) using UTF-8 Base64.
 * Each encoded-word is ≤75 octets; words are space-separated.
 */
export function encodeRfc2047(value: string): string {
  const charset = "UTF-8";
  const prefix = `=?${charset}?B?`;
  const suffix = "?=";
  // Leave room for prefix/suffix; keep chunk length a multiple of 4.
  const maxPayload = 75 - prefix.length - suffix.length;
  const chunkSize = Math.max(4, Math.floor(maxPayload / 4) * 4);
  const b64 = Buffer.from(value, "utf8").toString("base64");
  const words: string[] = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    words.push(`${prefix}${b64.slice(i, i + chunkSize)}${suffix}`);
  }
  return words.join(" ");
}

/** Unstructured header field (Subject): ASCII stays raw; otherwise RFC 2047. */
export function encodeUnstructuredHeader(value: string): string {
  const cleaned = sanitizeHeaderText(value);
  if (cleaned.length === 0 || isAsciiPrintable(cleaned)) {
    return cleaned;
  }
  return encodeRfc2047(cleaned);
}

/**
 * Mailbox header (From / To): encode display-name with RFC 2047 when needed;
 * keep the angle-addr / bare addr as ASCII.
 */
export function encodeMailboxHeader(value: string): string {
  const cleaned = sanitizeHeaderText(value);
  const angled = cleaned.match(/^(.*?)<([^<>]+)>\s*$/);
  if (angled) {
    const display = angled[1].trim().replace(/^"|"$/g, "");
    const addr = angled[2].trim();
    if (!display) {
      return `<${addr}>`;
    }
    if (!isAsciiPrintable(display)) {
      return `${encodeRfc2047(display)} <${addr}>`;
    }
    if (/[^A-Za-z0-9!#$%&'*+\-/=?^_`{|}~ ]/.test(display)) {
      return `"${display.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${addr}>`;
    }
    return `${display} <${addr}>`;
  }
  return cleaned;
}

/** Fold Base64 into CRLF-separated lines of at most 76 characters. */
export function wrapBase64(base64: string): string {
  const compact = base64.replace(/\s+/g, "");
  if (compact.length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (let i = 0; i < compact.length; i += BASE64_LINE_LENGTH) {
    lines.push(compact.slice(i, i + BASE64_LINE_LENGTH));
  }
  return lines.join("\r\n");
}

function encodeUtf8Base64Body(text: string): string {
  return wrapBase64(Buffer.from(text, "utf8").toString("base64"));
}

function formatRfc5322Date(date: Date): string {
  return date.toUTCString().replace(/GMT$/i, "+0000");
}

function domainFromMailbox(mailbox: string): string {
  const cleaned = sanitizeHeaderText(mailbox);
  const angled = cleaned.match(/<([^<>]+)>/);
  const addr = (angled?.[1] ?? cleaned).trim();
  const at = addr.lastIndexOf("@");
  if (at <= 0 || at === addr.length - 1) {
    return "localhost";
  }
  return addr.slice(at + 1);
}

export type BuildRawMimeEmailOptions = {
  /** Override clock for deterministic Date header in tests. */
  now?: Date;
  /** Override Message-ID (must include angle brackets) for tests. */
  messageId?: string;
};

/**
 * Build a multipart/related MIME message suitable for SES Raw and similar APIs.
 * Inline attachments are referenced from HTML via `cid:` Content-IDs.
 *
 * Headers follow RFC 2047 for non-ASCII Subject/display-name; Base64 bodies are
 * wrapped at 76 characters (RFC 2045) so no line exceeds the RFC 5322 998 limit.
 */
export function buildRawMimeEmail(
  message: EmailMessage,
  options: BuildRawMimeEmailOptions = {},
): Buffer {
  const prepared = withOkkeyMarkInlineAttachment(message);
  const attachments = prepared.inlineAttachments ?? [];
  const relatedBoundary = `okkey_related_${OKKEY_MARK_CID}`;
  const altBoundary = `okkey_alt_${OKKEY_MARK_CID}`;
  const now = options.now ?? new Date();
  const messageId =
    options.messageId ??
    `<${randomBytes(16).toString("hex")}@${domainFromMailbox(prepared.from)}>`;

  const lines: string[] = [];
  lines.push(`From: ${encodeMailboxHeader(prepared.from)}`);
  lines.push(`To: ${encodeMailboxHeader(prepared.to)}`);
  lines.push(`Subject: ${encodeUnstructuredHeader(prepared.subject)}`);
  lines.push(`Date: ${formatRfc5322Date(now)}`);
  lines.push(`Message-ID: ${messageId}`);
  lines.push("MIME-Version: 1.0");

  if (attachments.length === 0) {
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push("");
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(encodeUtf8Base64Body(prepared.text));
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(encodeUtf8Base64Body(prepared.html));
    lines.push(`--${altBoundary}--`);
    lines.push("");
    return Buffer.from(lines.join("\r\n"), "utf8");
  }

  lines.push(
    `Content-Type: multipart/related; boundary="${relatedBoundary}"; type="multipart/alternative"`,
  );
  lines.push("");
  lines.push(`--${relatedBoundary}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  lines.push("");
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(encodeUtf8Base64Body(prepared.text));
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(encodeUtf8Base64Body(prepared.html));
  lines.push(`--${altBoundary}--`);

  for (const attachment of attachments) {
    lines.push(`--${relatedBoundary}`);
    lines.push(`Content-Type: ${attachment.contentType}; name="${attachment.filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-ID: <${attachment.cid}>`);
    lines.push(`Content-Disposition: inline; filename="${attachment.filename}"`);
    lines.push("");
    lines.push(wrapBase64(attachment.contentBase64));
  }

  lines.push(`--${relatedBoundary}--`);
  lines.push("");
  return Buffer.from(lines.join("\r\n"), "utf8");
}
