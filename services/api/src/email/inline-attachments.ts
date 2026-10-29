import { randomBytes } from "node:crypto";

import {
  OKKEY_MARK_CID,
  okkeyMarkInlineAttachment,
  type OkkeyMarkInlineAttachment,
} from "@okkey/email-templates";

import type { EmailInlineAttachment, EmailMessage } from "./service.ts";

/** RFC 2045 base64 line length (soft wrap). Hard limit elsewhere is 998. */
const BASE64_LINE_LENGTH = 76;

/** RFC 2047 §2: each encoded-word ≤75; each header line with encoded-words ≤76. */
const ENCODED_WORD_MAX = 75;
const HEADER_LINE_MAX = 76;
/** RFC 5322 §2.1.1 hard limit per physical line (excluding CRLF). */
const HEADER_LINE_HARD_MAX = 998;

/** True when ASCII text looks like an RFC 2047 encoded-word (must not be sent raw). */
function looksLikeEncodedWord(value: string): boolean {
  return /=\?[^?\s]*\?[bBqQ]\?[^?]*\?=/.test(value);
}

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
 * Unwrap a quoted display-name only when the whole token is one quoted-string.
 * Do not strip wrapping quotes when unescaped `"` appear inside
 * (e.g. `"QA" Okkey "Team"` or a trailing `Inc. "QA"`).
 */
export function unquoteDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }
  // Walk the interior: an unescaped " before the final quote means this is not
  // a single wrapping quoted-string.
  for (let i = 1; i < trimmed.length - 1; i += 1) {
    if (trimmed[i] === "\\") {
      i += 1; // skip escaped octet
      continue;
    }
    if (trimmed[i] === '"') {
      return trimmed;
    }
  }
  return trimmed
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function encodeRfc2047Word(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

/**
 * RFC 2047 encoded-words (UTF-8 Base64).
 * Splits only on Unicode code-point boundaries so each word alone is valid UTF-8
 * (RFC 2047 §5). Each word is ≤ `maxWordLen` octets (default 75).
 */
export function encodeRfc2047Words(
  value: string,
  maxWordLen: number = ENCODED_WORD_MAX,
): string[] {
  const prefixLen = "=?UTF-8?B?".length + "?=".length;
  const maxPayload = Math.max(4, Math.floor((maxWordLen - prefixLen) / 4) * 4);
  const words: string[] = [];
  let chunk = "";

  for (const char of value) {
    const candidate = chunk + char;
    const payload = Buffer.from(candidate, "utf8").toString("base64");
    if (payload.length <= maxPayload) {
      chunk = candidate;
      continue;
    }
    if (chunk.length > 0) {
      words.push(encodeRfc2047Word(chunk));
      chunk = char;
      const nextPayload = Buffer.from(chunk, "utf8").toString("base64");
      if (nextPayload.length > maxPayload) {
        // Extremely wide single code point — emit alone.
        words.push(encodeRfc2047Word(chunk));
        chunk = "";
      }
      continue;
    }
    words.push(encodeRfc2047Word(char));
    chunk = "";
  }

  if (chunk.length > 0) {
    words.push(encodeRfc2047Word(chunk));
  }
  return words;
}

/**
 * Pack encoded-words so the first fits on `Name: …` (≤76) and the rest are ≤75.
 */
export function encodeRfc2047WordsForField(fieldName: string, value: string): string[] {
  const firstBudget = HEADER_LINE_MAX - `${fieldName}: `.length;
  const firstMax = Math.min(ENCODED_WORD_MAX, Math.max(prefixMinWordLen(), firstBudget));
  if (value.length === 0) {
    return [];
  }
  // Take as many code points as fit in the first-word budget, then pack the rest at 75.
  let firstChunk = "";
  let index = 0;
  const chars = [...value];
  while (index < chars.length) {
    const candidate = firstChunk + chars[index]!;
    if (encodeRfc2047Word(candidate).length <= firstMax) {
      firstChunk = candidate;
      index += 1;
      continue;
    }
    break;
  }
  if (firstChunk.length === 0) {
    // Single code point exceeds first-line budget — fold immediately (word ≤75).
    return encodeRfc2047Words(value, ENCODED_WORD_MAX);
  }
  const rest = chars.slice(index).join("");
  return [
    encodeRfc2047Word(firstChunk),
    ...encodeRfc2047Words(rest, ENCODED_WORD_MAX),
  ];
}

function prefixMinWordLen(): number {
  // Shortest possible encoded-word for one byte: =?UTF-8?B?AA==?=
  return encodeRfc2047Word("\0").length;
}

/** Join encoded-words with SPACE (no folding). Prefer formatHeaderField for headers. */
export function encodeRfc2047(value: string): string {
  return encodeRfc2047Words(value).join(" ");
}

/**
 * Fold a header field so each physical line is ≤ `lineMax` octets (default 76).
 * Encoded-words are separated by CRLF SPACE (RFC 2047 §2).
 * Returns the full `Name: …` field (may contain CRLF).
 */
export function formatHeaderField(
  name: string,
  valueParts: string[],
  lineMax: number = HEADER_LINE_MAX,
): string {
  if (valueParts.length === 0) {
    return `${name}:`;
  }
  const physical: string[] = [];
  let line = `${name}:`;
  for (const part of valueParts) {
    const separator = " ";
    if (line.length + separator.length + part.length <= lineMax) {
      line += separator + part;
      continue;
    }
    physical.push(line);
    line = ` ${part}`;
    if (line.length > lineMax) {
      throw new Error(
        `header continuation exceeds ${lineMax} octets (${name}: ${part.length})`,
      );
    }
  }
  physical.push(line);
  return physical.join("\r\n");
}

/**
 * Fold an ASCII header value on whitespace (RFC 5322 §2.2.3), preferring ≤76
 * octets per line. A single token with no break opportunity may use the full
 * 998-octet hard limit instead of throwing.
 */
export function formatAsciiHeaderField(name: string, value: string): string {
  const tokens = value.length === 0 ? [] : value.split(/ +/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return `${name}:`;
  }
  const physical: string[] = [];
  let line = `${name}:`;
  for (const token of tokens) {
    const separator = " ";
    const candidate = `${line}${separator}${token}`;
    if (candidate.length <= HEADER_LINE_MAX) {
      line = candidate;
      continue;
    }
    if (line !== `${name}:`) {
      physical.push(line);
      line = `${separator}${token}`;
    } else {
      // First token has no soft-wrap opportunity — keep on the name line.
      line = candidate;
    }
    if (line.length > HEADER_LINE_HARD_MAX) {
      throw new Error(
        `header line exceeds ${HEADER_LINE_HARD_MAX} octets (${name}: ${line.length})`,
      );
    }
  }
  physical.push(line);
  return physical.join("\r\n");
}

/** Unstructured header (Subject): ASCII raw (folded), else RFC 2047 with folding. */
export function formatUnstructuredHeader(name: string, value: string): string {
  const cleaned = sanitizeHeaderText(value);
  if (cleaned.length === 0) {
    return `${name}:`;
  }
  if (isAsciiPrintable(cleaned)) {
    // Literal text that looks like an encoded-word must itself be encoded,
    // otherwise MUAs decode it as RFC 2047.
    if (looksLikeEncodedWord(cleaned)) {
      return formatHeaderField(name, encodeRfc2047WordsForField(name, cleaned));
    }
    return formatAsciiHeaderField(name, cleaned);
  }
  return formatHeaderField(name, encodeRfc2047WordsForField(name, cleaned));
}

/** @deprecated Prefer formatUnstructuredHeader — kept for tests of word encoding. */
export function encodeUnstructuredHeader(value: string): string {
  const cleaned = sanitizeHeaderText(value);
  if (cleaned.length === 0) {
    return cleaned;
  }
  if (isAsciiPrintable(cleaned) && !looksLikeEncodedWord(cleaned)) {
    return cleaned;
  }
  return encodeRfc2047(cleaned);
}

/**
 * Mailbox header (From / To): encode display-name with RFC 2047 when needed;
 * keep the angle-addr / bare addr as ASCII. Returns full folded `Name: …`.
 */
export function formatMailboxHeader(name: string, value: string): string {
  const cleaned = sanitizeHeaderText(value);
  const angled = cleaned.match(/^(.*?)<([^<>]+)>\s*$/);
  if (!angled) {
    // Bare addr / unstructured mailbox — fold on whitespace, allow ≤998.
    return formatAsciiHeaderField(name, cleaned);
  }

  const display = unquoteDisplayName(angled[1]);
  const addr = angled[2].trim();
  if (!display) {
    return formatAsciiHeaderField(name, `<${addr}>`);
  }

  if (!isAsciiPrintable(display)) {
    const words = encodeRfc2047WordsForField(name, display);
    const addrPart = `<${addr}>`;
    // Try to keep ` <addr>` on the last encoded-word line; else fold it.
    const folded = formatHeaderField(name, words);
    const lines = folded.split("\r\n");
    const last = lines[lines.length - 1]!;
    const withAddr = `${last} ${addrPart}`;
    if (withAddr.length <= HEADER_LINE_MAX) {
      lines[lines.length - 1] = withAddr;
    } else if (` ${addrPart}`.length <= HEADER_LINE_HARD_MAX) {
      lines.push(` ${addrPart}`);
    } else {
      throw new Error(
        `header continuation exceeds ${HEADER_LINE_HARD_MAX} octets (${name}: ${addrPart.length})`,
      );
    }
    return lines.join("\r\n");
  }

  if (/[^A-Za-z0-9!#$%&'*+\-/=?^_`{|}~ ]/.test(display)) {
    const quoted = `"${display.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    // Do not split inside the quoted-string; allow the hard 998 limit.
    return formatHeaderField(name, [`${quoted} <${addr}>`], HEADER_LINE_HARD_MAX);
  }
  return formatAsciiHeaderField(name, `${display} <${addr}>`);
}

/** Value-only mailbox encode for unit tests (no field name / folding). */
export function encodeMailboxHeader(value: string): string {
  const cleaned = sanitizeHeaderText(value);
  const angled = cleaned.match(/^(.*?)<([^<>]+)>\s*$/);
  if (!angled) {
    return cleaned;
  }
  const display = unquoteDisplayName(angled[1]);
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
 * Headers follow RFC 2047 for non-ASCII Subject/display-name (character-boundary
 * splits, folded ≤76); ASCII headers fold on whitespace or stay ≤998 (RFC 5322);
 * Base64 bodies wrap at 76 (RFC 2045).
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
  lines.push(formatMailboxHeader("From", prepared.from));
  lines.push(formatMailboxHeader("To", prepared.to));
  lines.push(formatUnstructuredHeader("Subject", prepared.subject));
  lines.push(`Date: ${formatRfc5322Date(now)}`);
  lines.push(`Message-ID: ${messageId}`);
  lines.push("MIME-Version: 1.0");

  if (attachments.length === 0) {
    lines.push(
      formatHeaderField("Content-Type", [
        "multipart/alternative;",
        `boundary="${altBoundary}"`,
      ]),
    );
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
    formatHeaderField("Content-Type", [
      "multipart/related;",
      `boundary="${relatedBoundary}";`,
      'type="multipart/alternative"',
    ]),
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
