import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmailSender,
  HttpApiEmailSender,
  LoggerEmailSender,
} from "../src/email/service.ts";
import type { ApiConfig } from "../src/config.ts";

const baseConfig: ApiConfig = {
  nodeEnv: "test",
  port: 4000,
  logLevel: "debug",
  corsOrigin: "*",
  databaseUrl: "",
  redisUrl: "",
  authCodeTtlSeconds: 300,
  authResendCooldownSeconds: 60,
  authCodeMaxAttempts: 5,
  authRateLimitWindowSeconds: 600,
  authRateLimitStartPerEmail: 5,
  authRateLimitStartPerIp: 10,
  authRateLimitConfirmPerIp: 30,
  authRateLimitResendPerIp: 10,
  defaultEmailLocale: "en",
  emailFrom: "no-reply@okkey.local",
  emailProvider: "logger",
  smtpHost: "localhost",
  smtpPort: 1025,
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  emailApiEndpoint: "",
  emailApiKey: "",
  emailApiTimeoutMs: 1000,
};

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
