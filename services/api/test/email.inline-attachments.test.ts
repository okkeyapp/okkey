import test from "node:test";
import assert from "node:assert/strict";
import { OKKEY_MARK_CID, OKKEY_MARK_PNG_BASE64 } from "@okkey/email-templates";
import {
  buildRawMimeEmail,
  encodeMailboxHeader,
  encodeRfc2047,
  encodeUnstructuredHeader,
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

test("encodeUnstructuredHeader uses RFC 2047 for non-ASCII subjects", () => {
  const subject = "819281 — код входа в Okkey";
  const encoded = encodeUnstructuredHeader(subject);
  assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  assert.ok(!encoded.includes("код"));
  const payload = encoded.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, "");
  assert.equal(Buffer.from(payload, "base64").toString("utf8"), subject);
});

test("encodeMailboxHeader RFC 2047-encodes non-ASCII display names", () => {
  const encoded = encodeMailboxHeader("Оккей <no-reply@okkey.local>");
  assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <no-reply@okkey\.local>$/);
  assert.equal(encodeMailboxHeader("Okkey <no-reply@okkey.local>"), "Okkey <no-reply@okkey.local>");
  assert.equal(encodeMailboxHeader("no-reply@okkey.local"), "no-reply@okkey.local");
});

test("encodeRfc2047 splits long values into ≤75-octet encoded-words", () => {
  const long = "я".repeat(80);
  const encoded = encodeRfc2047(long);
  for (const word of encoded.split(" ")) {
    assert.ok(word.length <= 75, `encoded-word length ${word.length}`);
    assert.match(word, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  }
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

test("buildRawMimeEmail encodes UTF-8 subject and wraps base64 bodies", () => {
  const longHtml = `<p>${"x".repeat(2000)}</p><img src="cid:${OKKEY_MARK_CID}" alt="Okkey" />`;
  const raw = buildRawMimeEmail(
    {
      ...baseMessage,
      from: "Okkey <no-reply@okkey.local>",
      subject: "819281 — код входа в Okkey",
      text: "plain ".repeat(400),
      html: longHtml,
    },
    { now: fixedNow, messageId: fixedMessageId },
  ).toString("utf8");

  assert.match(raw, /^From: Okkey <no-reply@okkey\.local>\r\n/m);
  assert.match(raw, /^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/m);
  assert.doesNotMatch(raw, /^Subject:.*код/m);
  assert.match(raw, /^Date: Fri, 23 Oct 2026 12:00:00 \+0000\r\n/m);
  assert.match(raw, /^Message-ID: <test-message-id@okkey\.local>\r\n/m);

  const oversize = raw.split(/\r\n/).filter((line) => line.length > 998);
  assert.deepEqual(oversize, [], `lines longer than 998: ${oversize.map((l) => l.length)}`);

  const bodyLines = raw.split(/\r\n/).filter((line) => /^[A-Za-z0-9+/=]+$/.test(line));
  assert.ok(bodyLines.length > 1);
  for (const line of bodyLines) {
    assert.ok(line.length <= 76, `base64 line length ${line.length}`);
  }
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
  assert.match(calls[0].html, /cid:okkey-mark/);
  assert.equal(calls[0].attachments?.length, 1);
  assert.equal(calls[0].attachments?.[0]?.cid, OKKEY_MARK_CID);
  assert.equal(calls[0].attachments?.[0]?.contentDisposition, "inline");
});
