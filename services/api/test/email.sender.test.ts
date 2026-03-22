import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmailSender,
  HttpApiEmailSender,
  LoggerEmailSender,
} from "../src/email/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const baseConfig: ApiConfig = createTestApiConfig({ emailApiTimeoutMs: 1000 });

test("createEmailSender returns LoggerEmailSender for logger provider", async () => {
  const sender = await createEmailSender(baseConfig, {
    info() {},
    error() {},
  });
  assert.ok(sender instanceof LoggerEmailSender);
});

test("createEmailSender validates http-api config", async () => {
  await assert.rejects(
    () =>
      createEmailSender(
        {
          ...baseConfig,
          emailProvider: "http-api",
          emailApiEndpoint: "",
          emailApiKey: "",
        },
        { info() {}, error() {} },
      ),
    /EMAIL_API_ENDPOINT is required/,
  );
});

test("HttpApiEmailSender posts payload to configured endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string | null }> = [];

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  try {
    const sender = new HttpApiEmailSender(
      "https://email.example/send",
      "api-key",
      1000,
    );
    await sender.send({
      to: "user@example.com",
      from: "no-reply@okkey.local",
      subject: "Test",
      text: "Text",
      html: "<p>Text</p>",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://email.example/send");
    assert.match(calls[0].body ?? "", /"to":"user@example.com"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
