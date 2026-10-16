import test from "node:test";
import assert from "node:assert/strict";
import { OKKEY_MARK_CID, OKKEY_MARK_PNG_BASE64 } from "@okkey/email-templates";
import {
  buildRawMimeEmail,
  withOkkeyMarkInlineAttachment,
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

test("buildRawMimeEmail embeds CID image part", () => {
  const raw = buildRawMimeEmail(baseMessage).toString("utf8");
  assert.match(raw, /multipart\/related/);
  assert.match(raw, /Content-ID: <okkey-mark>/);
  assert.match(raw, /image\/png/);
  assert.ok(raw.includes(OKKEY_MARK_PNG_BASE64.slice(0, 32)));
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
