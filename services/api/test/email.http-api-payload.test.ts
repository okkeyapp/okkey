import test from "node:test";
import assert from "node:assert/strict";
import {
  OKKEY_MARK_CID,
  OKKEY_MARK_CONTENT_TYPE,
  OKKEY_MARK_PNG_BASE64,
} from "@okkey/email-templates";
import {
  isSafeEmailLogoUrl,
  parseEmailHttpApiInlineMode,
} from "../src/email/http-api-inline-mode.ts";
import { prepareHttpApiEmailPayload } from "../src/email/http-api-payload.ts";
import { HttpApiEmailSender } from "../src/email/service.ts";
import type { EmailMessage } from "../src/email/service.ts";
import { assertEmailTransportConfig } from "../src/email/service.ts";
import { resolveEmailLogoUrl } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const baseMessage: EmailMessage = {
  to: "user@example.com",
  from: "no-reply@okkey.local",
  subject: "Hello",
  text: "plain",
  html: `<p><img src="cid:${OKKEY_MARK_CID}" width="32" height="32" alt="Okkey" /></p><span>Okkey</span>`,
};

test("parseEmailHttpApiInlineMode defaults to cid", () => {
  assert.equal(parseEmailHttpApiInlineMode(undefined), "cid");
  assert.equal(parseEmailHttpApiInlineMode(""), "cid");
  assert.equal(parseEmailHttpApiInlineMode(" CID "), "cid");
});

test("parseEmailHttpApiInlineMode rejects unknown values", () => {
  assert.throws(() => parseEmailHttpApiInlineMode("attach"), /EMAIL_HTTP_API_INLINE/);
});

test("isSafeEmailLogoUrl accepts https only", () => {
  assert.equal(isSafeEmailLogoUrl("https://cdn.example.com/okkey-mark.png"), true);
  assert.equal(isSafeEmailLogoUrl("http://cdn.example.com/okkey-mark.png"), false);
  assert.equal(isSafeEmailLogoUrl("javascript:alert(1)"), false);
  assert.equal(isSafeEmailLogoUrl("data:image/png;base64,aaa"), false);
  assert.equal(isSafeEmailLogoUrl("https://user:pass@cdn.example.com/x.png"), false);
  assert.equal(isSafeEmailLogoUrl("/relative.png"), false);
});

test("resolveEmailLogoUrl allows empty and rejects unsafe values", () => {
  assert.equal(resolveEmailLogoUrl(undefined), "");
  assert.equal(resolveEmailLogoUrl("  "), "");
  assert.equal(
    resolveEmailLogoUrl("https://cdn.example.com/okkey-mark.png"),
    "https://cdn.example.com/okkey-mark.png",
  );
  assert.throws(() => resolveEmailLogoUrl("http://cdn.example.com/x.png"), /EMAIL_LOGO_URL/);
});

test("prepareHttpApiEmailPayload cid mode includes inlineAttachments", () => {
  const prepared = prepareHttpApiEmailPayload(baseMessage, { inlineMode: "cid" });
  assert.match(prepared.html, /cid:okkey-mark/);
  assert.equal(prepared.inlineAttachments?.length, 1);
  assert.equal(prepared.inlineAttachments?.[0]?.cid, OKKEY_MARK_CID);
  assert.equal(prepared.inlineAttachments?.[0]?.contentBase64, OKKEY_MARK_PNG_BASE64);
});

test("prepareHttpApiEmailPayload data mode embeds data URI and omits attachments", () => {
  const prepared = prepareHttpApiEmailPayload(baseMessage, { inlineMode: "data" });
  const expected = `data:${OKKEY_MARK_CONTENT_TYPE};base64,${OKKEY_MARK_PNG_BASE64}`;
  assert.ok(prepared.html.includes(`src="${expected}"`));
  assert.equal(prepared.html.includes(`cid:${OKKEY_MARK_CID}`), false);
  assert.equal("inlineAttachments" in prepared, false);
});

test("prepareHttpApiEmailPayload none mode strips logo img and keeps wordmark", () => {
  const prepared = prepareHttpApiEmailPayload(baseMessage, { inlineMode: "none" });
  assert.equal(prepared.html.includes("<img"), false);
  assert.match(prepared.html, /Okkey/);
  assert.equal("inlineAttachments" in prepared, false);
});

test("prepareHttpApiEmailPayload url mode rewrites src and omits attachments", () => {
  const logoUrl = "https://cdn.example.com/okkey-mark.png";
  const prepared = prepareHttpApiEmailPayload(baseMessage, {
    inlineMode: "url",
    logoUrl,
  });
  assert.match(prepared.html, /src="https:\/\/cdn\.example\.com\/okkey-mark\.png"/);
  assert.equal(prepared.html.includes(`cid:${OKKEY_MARK_CID}`), false);
  assert.equal("inlineAttachments" in prepared, false);
});

test("prepareHttpApiEmailPayload url mode rejects unsafe logo URL", () => {
  assert.throws(
    () =>
      prepareHttpApiEmailPayload(baseMessage, {
        inlineMode: "url",
        logoUrl: "http://insecure.example/x.png",
      }),
    /EMAIL_LOGO_URL/,
  );
});

test("assertEmailTransportConfig requires EMAIL_LOGO_URL for url mode", () => {
  assert.throws(
    () =>
      assertEmailTransportConfig(
        createTestApiConfig({
          emailProvider: "http-api",
          emailApiEndpoint: "https://mail.example/send",
          emailApiKey: "k",
          emailHttpApiInlineMode: "url",
          emailLogoUrl: "",
        }),
      ),
    /EMAIL_LOGO_URL/,
  );
});

test("HttpApiEmailSender posts cid payload with inlineAttachments by default", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    bodies.push(typeof init?.body === "string" ? init.body : "");
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  try {
    const sender = new HttpApiEmailSender("https://email.example/send", "api-key", 1000);
    await sender.send(baseMessage);
    const parsed = JSON.parse(bodies[0] ?? "{}") as {
      html?: string;
      inlineAttachments?: Array<{ cid: string }>;
    };
    assert.match(parsed.html ?? "", /cid:okkey-mark/);
    assert.equal(parsed.inlineAttachments?.[0]?.cid, OKKEY_MARK_CID);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HttpApiEmailSender none mode posts HTML without logo img or attachments", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    bodies.push(typeof init?.body === "string" ? init.body : "");
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  try {
    const sender = new HttpApiEmailSender("https://email.example/send", "api-key", 1000, {
      inlineMode: "none",
    });
    await sender.send(baseMessage);
    const parsed = JSON.parse(bodies[0] ?? "{}") as {
      html?: string;
      inlineAttachments?: unknown;
    };
    assert.equal((parsed.html ?? "").includes("<img"), false);
    assert.equal(parsed.inlineAttachments, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
