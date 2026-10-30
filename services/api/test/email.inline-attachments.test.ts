import test from "node:test";
import assert from "node:assert/strict";
import { OKKEY_MARK_CID, OKKEY_MARK_PNG_BASE64 } from "@okkey/email-templates";
import {
  buildRawMimeEmail,
  encodeMailboxHeader,
  encodeRfc2047,
  encodeRfc2047Words,
  encodeUnstructuredHeader,
  formatAsciiHeaderField,
  formatMailboxHeader,
  formatUnstructuredHeader,
  unquoteDisplayName,
  withOkkeyMarkInlineAttachment,
  wrapBase64,
} from "../src/email/inline-attachments.ts";
import type { EmailMessage } from "../src/email/service.ts";
import { SmtpEmailSender } from "../src/email/service.ts";

const baseMessage: EmailMessage = {
  to: "user@example.com",
  from: "no-reply@okkey.local",
  subject: "Hello",
  text: "plain",
  html: `<p><img src="cid:${OKKEY_MARK_CID}" alt="Okkey" /></p>`,
};

const fixedNow = new Date("2026-10-23T12:00:00.000Z");
const fixedMessageId = "<test-message-id@okkey.local>";

const RU_DEVICE_APPROVAL_SUBJECT =
  "Новый вход с устройства — требуется подтверждение";

const RU_CATALOG_SUBJECTS = [
  RU_DEVICE_APPROVAL_SUBJECT,
  "Восстановление через устройство — нужно подтверждение",
  "Приглашение в пространство «Design»",
  "Резервные коды Okkey перевыпущены",
  "Адрес email аккаунта Okkey изменён",
  "819281 — код входа в Okkey",
  "В Okkey включена двухфакторная аутентификация",
  "Заявка на лицензию: Pro — Workspace42",
];

function encodedWordsIn(text: string): string[] {
  return [...text.matchAll(/=\?UTF-8\?[Bb]\?[A-Za-z0-9+/=]+\?=/g)].map((m) => m[0]!);
}

function decodeEncodedWord(word: string): string {
  const match = /^=\?UTF-8\?[Bb]\?([A-Za-z0-9+/=]+)\?=$/.exec(word);
  assert.ok(match, `not an encoded-word: ${word}`);
  const buf = Buffer.from(match[1]!, "base64");
  // Must be well-formed UTF-8 on its own (RFC 2047 §5).
  const decoded = buf.toString("utf8");
  assert.equal(Buffer.from(decoded, "utf8").compare(buf), 0, `invalid UTF-8 in ${word}`);
  return decoded;
}

function assertHeaderLinesWithEncodedWordsAtMost76(raw: string): void {
  for (const line of raw.split(/\r\n/)) {
    if (!line.includes("=?")) {
      continue;
    }
    assert.ok(
      line.length <= 76,
      `header line with encoded-word is ${line.length} (>76): ${line.slice(0, 90)}`,
    );
  }
}

test("withOkkeyMarkInlineAttachment injects PNG when HTML references CID", () => {
  const prepared = withOkkeyMarkInlineAttachment(baseMessage);
  assert.equal(prepared.inlineAttachments?.length, 1);
  assert.equal(prepared.inlineAttachments?.[0]?.cid, OKKEY_MARK_CID);
  assert.equal(prepared.inlineAttachments?.[0]?.contentBase64, OKKEY_MARK_PNG_BASE64);
});

test("withOkkeyMarkInlineAttachment is a no-op without CID reference", () => {
  const prepared = withOkkeyMarkInlineAttachment({
    ...baseMessage,
    html: "<p>no logo</p>",
  });
  assert.equal(prepared.inlineAttachments, undefined);
});

test("encodeUnstructuredHeader leaves ASCII subjects untouched", () => {
  assert.equal(encodeUnstructuredHeader("Hello Okkey"), "Hello Okkey");
});

test("encodeUnstructuredHeader encodes ASCII that looks like an encoded-word", () => {
  const fake = "=?UTF-8?B?SGVsbG8=?=";
  const encoded = encodeUnstructuredHeader(fake);
  assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  assert.equal(encodedWordsIn(encoded).map(decodeEncodedWord).join(""), fake);
});

test("formatUnstructuredHeader encodes ASCII that looks like an encoded-word", () => {
  const fake = "=?UTF-8?B?SGVsbG8=?=";
  const field = formatUnstructuredHeader("Subject", fake);
  assert.match(field, /^Subject: =\?UTF-8\?B\?/);
  assert.equal(encodedWordsIn(field).map(decodeEncodedWord).join(""), fake);
});

test("formatAsciiHeaderField folds long ASCII on whitespace", () => {
  const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
  const value = words.join(" ");
  const field = formatAsciiHeaderField("Subject", value);
  assert.match(field, /\r\n /);
  for (const line of field.split("\r\n")) {
    assert.ok(line.length <= 76, `soft-wrapped line ${line.length}: ${line}`);
  }
  assert.equal(field.replace(/\r\n /g, " ").slice("Subject: ".length), value);
});

test("formatAsciiHeaderField allows unsplittable ASCII up to 998", () => {
  const addr = `${"a".repeat(80)}@example.com`;
  assert.ok(addr.length > 75);
  const field = formatAsciiHeaderField("To", addr);
  assert.equal(field, `To: ${addr}`);
  assert.ok(field.length <= 998);
  assert.doesNotMatch(field, /\r\n/);
});

test("formatMailboxHeader accepts long bare To addresses without throwing", () => {
  const addr = `${"user".repeat(20)}@very-long-domain-name.example.com`;
  assert.ok(addr.length > 75);
  const field = formatMailboxHeader("To", addr);
  assert.equal(field, `To: ${addr}`);
});

test("formatMailboxHeader accepts long ASCII From without throwing", () => {
  const from = `${"n".repeat(70)}@okkey.example`;
  assert.ok(from.length > 75);
  const field = formatMailboxHeader("From", from);
  assert.equal(field, `From: ${from}`);
});

test("formatUnstructuredHeader accepts long ASCII subjects without throwing", () => {
  const subject = `Okkey notice ${"x".repeat(80)}`;
  assert.ok(subject.length > 75);
  const field = formatUnstructuredHeader("Subject", subject);
  assert.match(field, /^Subject: /);
  assert.ok(!field.includes("header continuation exceeds"));
  const unfolded = field.replace(/\r\n /g, " ");
  assert.equal(unfolded, `Subject: ${subject}`);
});

test("encodeUnstructuredHeader uses RFC 2047 for non-ASCII subjects", () => {
  const subject = "819281 — код входа в Okkey";
  const encoded = encodeUnstructuredHeader(subject);
  assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  assert.ok(!encoded.includes("код"));
  const joined = encodedWordsIn(encoded).map(decodeEncodedWord).join("");
  assert.equal(joined, subject);
});

test("encodeRfc2047Words never splits a multibyte UTF-8 character", () => {
  for (const subject of RU_CATALOG_SUBJECTS) {
    const words = encodeRfc2047Words(subject);
    assert.ok(words.length >= 1, subject);
    let rebuilt = "";
    for (const word of words) {
      assert.ok(word.length <= 75, `${word.length} in ${subject}`);
      rebuilt += decodeEncodedWord(word);
    }
    assert.equal(rebuilt, subject);
  }
});

test("encodeRfc2047Words keeps each word valid UTF-8 for long Cyrillic", () => {
  const long = "я".repeat(80);
  const words = encodeRfc2047Words(long);
  assert.ok(words.length > 1);
  for (const word of words) {
    assert.ok(word.length <= 75);
    const piece = decodeEncodedWord(word);
    assert.match(piece, /^я+$/);
  }
  assert.equal(words.map(decodeEncodedWord).join(""), long);
});

test("formatUnstructuredHeader folds encoded-words so each line is ≤76", () => {
  const field = formatUnstructuredHeader("Subject", RU_DEVICE_APPROVAL_SUBJECT);
  assertHeaderLinesWithEncodedWordsAtMost76(field);
  const words = encodedWordsIn(field);
  assert.ok(words.length >= 2, "device approval subject should need multiple words");
  assert.equal(words.map(decodeEncodedWord).join(""), RU_DEVICE_APPROVAL_SUBJECT);
  assert.match(field, /\r\n /);
});

test("unquoteDisplayName only strips wrapping quotes", () => {
  assert.equal(unquoteDisplayName('"Okkey"'), "Okkey");
  assert.equal(unquoteDisplayName('Okkey, Inc. "QA"'), 'Okkey, Inc. "QA"');
  assert.equal(unquoteDisplayName('"Okkey, Inc. \\"QA\\""'), 'Okkey, Inc. "QA"');
  assert.equal(unquoteDisplayName('"QA" Okkey "Team"'), '"QA" Okkey "Team"');
});

test("encodeMailboxHeader preserves trailing quote inside display-name", () => {
  const encoded = encodeMailboxHeader('Okkey, Inc. "QA" <no-reply@okkey.local>');
  assert.equal(encoded, `"Okkey, Inc. \\"QA\\"" <no-reply@okkey.local>`);
});

test("encodeMailboxHeader preserves outer quotes around multi-quote display-name", () => {
  const encoded = encodeMailboxHeader('"QA" Okkey "Team" <no-reply@okkey.local>');
  assert.equal(encoded, `"\\"QA\\" Okkey \\"Team\\"" <no-reply@okkey.local>`);
});

test("formatMailboxHeader preserves multi-quote display-name", () => {
  const field = formatMailboxHeader("From", '"QA" Okkey "Team" <no-reply@okkey.local>');
  assert.equal(field, `From: "\\"QA\\" Okkey \\"Team\\"" <no-reply@okkey.local>`);
});

test("encodeMailboxHeader RFC 2047-encodes non-ASCII display names", () => {
  const encoded = encodeMailboxHeader("Оккей <no-reply@okkey.local>");
  assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <no-reply@okkey\.local>$/);
  assert.equal(encodeMailboxHeader("Okkey <no-reply@okkey.local>"), "Okkey <no-reply@okkey.local>");
  assert.equal(encodeMailboxHeader("no-reply@okkey.local"), "no-reply@okkey.local");
});

test("wrapBase64 folds at 76 characters without whitespace inside chunks", () => {
  const compact = "A".repeat(200);
  const wrapped = wrapBase64(compact);
  const lines = wrapped.split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0].length, 76);
  assert.equal(lines[1].length, 76);
  assert.equal(lines[2].length, 48);
  assert.equal(lines.join(""), compact);
});

test("buildRawMimeEmail embeds CID image part", () => {
  const raw = buildRawMimeEmail(baseMessage, {
    now: fixedNow,
    messageId: fixedMessageId,
  }).toString("utf8");
  assert.match(raw, /multipart\/related/);
  assert.match(raw, /Content-ID: <okkey-mark>/);
  assert.match(raw, /image\/png/);
  assert.ok(raw.includes(OKKEY_MARK_PNG_BASE64.slice(0, 32)));
});

test("buildRawMimeEmail folds multipart/related Content-Type to ≤76", () => {
  const raw = buildRawMimeEmail(baseMessage, {
    now: fixedNow,
    messageId: fixedMessageId,
  }).toString("utf8");
  const header = raw.split(/\r\n\r\n/)[0]!;
  const ctLines = header.split("\r\n").filter((line, i, all) => {
    if (line.startsWith("Content-Type:")) {
      return true;
    }
    // Continuations belonging to Content-Type
    if (/^\s/.test(line)) {
      const prev = all[i - 1]!;
      return prev.startsWith("Content-Type:") || /^\s/.test(prev);
    }
    return false;
  });
  // First Content-Type in a related message is multipart/related
  assert.match(ctLines[0]!, /^Content-Type: multipart\/related;/);
  for (const line of ctLines) {
    if (line.includes("multipart/related") || line.includes('type="multipart/alternative"')
      || line.includes("okkey_related_")) {
      assert.ok(line.length <= 76, `Content-Type line ${line.length}: ${line}`);
    }
  }
  assert.match(header, /Content-Type: multipart\/related;[\s\S]*type="multipart\/alternative"/);
});

test("buildRawMimeEmail sends long ASCII To/From/Subject without throwing", () => {
  const longTo = `${"a".repeat(80)}@example.com`;
  const longFrom = `${"b".repeat(82)}@okkey.example`;
  const longSubject = `Notice ${"z".repeat(80)}`;
  assert.ok(longTo.length > 75 && longFrom.length > 75 && longSubject.length > 75);
  const raw = buildRawMimeEmail(
    {
      ...baseMessage,
      to: longTo,
      from: longFrom,
      subject: longSubject,
      html: "<p>no logo</p>",
    },
    { now: fixedNow, messageId: fixedMessageId },
  ).toString("utf8");
  assert.match(raw, new RegExp(`^To: ${longTo.replace(/\./g, "\\.")}\\r\\n`, "m"));
  assert.match(raw, new RegExp(`^From: ${longFrom.replace(/\./g, "\\.")}\\r\\n`, "m"));
  const subjectField = raw.match(/^Subject:[\s\S]*?(?=\r\n(?:Date|Message-ID|MIME-Version|Content-Type):)/m)?.[0];
  assert.ok(subjectField, "Subject header missing");
  assert.equal(subjectField.replace(/\r\n /g, " "), `Subject: ${longSubject}`);
  const oversize = raw.split(/\r\n/).filter((line) => line.length > 998);
  assert.deepEqual(oversize, []);
});

test("buildRawMimeEmail encodes subject that looks like an encoded-word", () => {
  const fake = "=?UTF-8?B?SGVsbG8=?=";
  const raw = buildRawMimeEmail(
    {
      ...baseMessage,
      subject: fake,
      html: "<p>no logo</p>",
    },
    { now: fixedNow, messageId: fixedMessageId },
  ).toString("utf8");
  const header = raw.split(/\r\n\r\n/)[0]!;
  assert.match(header, /^Subject: =\?UTF-8\?B\?/m);
  assert.equal(encodedWordsIn(header).map(decodeEncodedWord).join(""), fake);
});

test("buildRawMimeEmail preserves multi-quote From display-name", () => {
  const raw = buildRawMimeEmail(
    {
      ...baseMessage,
      from: '"QA" Okkey "Team" <no-reply@okkey.local>',
      html: "<p>no logo</p>",
    },
    { now: fixedNow, messageId: fixedMessageId },
  ).toString("utf8");
  assert.match(
    raw,
    /^From: "\\"QA\\" Okkey \\"Team\\"" <no-reply@okkey\.local>\r\n/m,
  );
});

test("buildRawMimeEmail encodes UTF-8 subject, folds headers, wraps base64", () => {
  const longHtml = `<p>${"x".repeat(2000)}</p><img src="cid:${OKKEY_MARK_CID}" alt="Okkey" />`;
  const raw = buildRawMimeEmail(
    {
      ...baseMessage,
      from: "Okkey <no-reply@okkey.local>",
      subject: RU_DEVICE_APPROVAL_SUBJECT,
      text: "plain ".repeat(400),
      html: longHtml,
    },
    { now: fixedNow, messageId: fixedMessageId },
  ).toString("utf8");

  assert.match(raw, /^From: Okkey <no-reply@okkey\.local>\r\n/m);
  assert.match(raw, /^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/m);
  assert.doesNotMatch(raw, /^Subject:.*[^\x00-\x7F]/m);
  assert.match(raw, /^Date: Fri, 23 Oct 2026 12:00:00 \+0000\r\n/m);
  assert.match(raw, /^Message-ID: <test-message-id@okkey\.local>\r\n/m);

  assertHeaderLinesWithEncodedWordsAtMost76(raw);
  const headerBlock = raw.split(/\r\n\r\n/)[0]!;
  assert.equal(
    encodedWordsIn(headerBlock).map(decodeEncodedWord).join(""),
    RU_DEVICE_APPROVAL_SUBJECT,
  );

  const oversize = raw.split(/\r\n/).filter((line) => line.length > 998);
  assert.deepEqual(oversize, [], `lines longer than 998: ${oversize.map((l) => l.length)}`);

  const bodyLines = raw.split(/\r\n/).filter((line) => /^[A-Za-z0-9+/=]+$/.test(line));
  assert.ok(bodyLines.length > 1);
  for (const line of bodyLines) {
    assert.ok(line.length <= 76, `base64 line length ${line.length}`);
  }
});

test("buildRawMimeEmail keeps each Subject encoded-word valid UTF-8 alone", () => {
  for (const subject of RU_CATALOG_SUBJECTS) {
    const raw = buildRawMimeEmail(
      {
        ...baseMessage,
        subject,
        html: "<p>no logo</p>",
      },
      { now: fixedNow, messageId: fixedMessageId },
    ).toString("utf8");
    assertHeaderLinesWithEncodedWordsAtMost76(raw);
    const header = raw.split(/\r\n\r\n/)[0]!;
    const words = encodedWordsIn(header);
    assert.equal(words.map(decodeEncodedWord).join(""), subject, subject);
  }
});

test("buildRawMimeEmail preserves quoted display-name ending with quote", () => {
  const raw = buildRawMimeEmail(
    {
      ...baseMessage,
      from: 'Okkey, Inc. "QA" <no-reply@okkey.local>',
      html: "<p>no logo</p>",
    },
    { now: fixedNow, messageId: fixedMessageId },
  ).toString("utf8");
  assert.match(raw, /^From: "Okkey, Inc\. \\"QA\\"" <no-reply@okkey\.local>\r\n/m);
});

test("buildRawMimeEmail strips CR/LF from subject to prevent header injection", () => {
  const raw = buildRawMimeEmail(
    {
      ...baseMessage,
      subject: "Hello\r\nBcc: evil@example.com",
      html: "<p>no logo</p>",
    },
    { now: fixedNow, messageId: fixedMessageId },
  ).toString("utf8");
  assert.match(raw, /^Subject: Hello Bcc: evil@example\.com\r\n/m);
  assert.doesNotMatch(raw, /^Bcc:/m);
});

test("SmtpEmailSender passes inline CID attachment to nodemailer", async () => {
  const calls: Array<{
    html: string;
    attachments?: Array<{ cid: string; contentDisposition: string }>;
  }> = [];
  const sender = new SmtpEmailSender({
    async sendMail(options) {
      calls.push({
        html: options.html,
        attachments: options.attachments?.map((item) => ({
          cid: item.cid,
          contentDisposition: item.contentDisposition,
        })),
      });
    },
  });
  await sender.send(baseMessage);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.html, /cid:okkey-mark/);
  assert.equal(calls[0]!.attachments?.length, 1);
  assert.equal(calls[0]!.attachments?.[0]?.cid, OKKEY_MARK_CID);
  assert.equal(calls[0]!.attachments?.[0]?.contentDisposition, "inline");
});

// Keep encodeRfc2047 import used for intentional smoke.
test("encodeRfc2047 joins character-safe words with spaces", () => {
  const encoded = encodeRfc2047(RU_DEVICE_APPROVAL_SUBJECT);
  assert.equal(
    encodedWordsIn(encoded).map(decodeEncodedWord).join(""),
    RU_DEVICE_APPROVAL_SUBJECT,
  );
});
