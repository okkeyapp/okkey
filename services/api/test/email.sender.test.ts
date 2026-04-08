import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmailSender,
  HttpApiEmailSender,
  LoggerEmailSender,
  type EmailMessage,
} from "../src/email/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const baseConfig: ApiConfig = createTestApiConfig({ emailApiTimeoutMs: 1000 });

test("LoggerEmailSender info log omits text and html bodies (no secret leakage)", async () => {
  const entries: Array<{ message: string; extra: Record<string, unknown> }> = [];
  const logger = {
    info(message: string, extra?: Record<string, unknown>) {
      entries.push({ message, extra: extra ?? {} });
    },
    warn() {},
    error() {},
  };
  const sender = new LoggerEmailSender(logger);
  const payload: EmailMessage = {
    to: "user@example.com",
    from: "no-reply@okkey.local",
    subject: "Your code",
    text: "SECRET_PLAIN_BODY_123456",
    html: "<p>SECRET_HTML_123456</p>",
  };
  await sender.send(payload);
  const row = entries.find((e) => e.message === "email sent");
  assert.ok(row);
  assert.equal(row.extra.plainText, undefined);
  assert.equal(row.extra.text, undefined);
  assert.equal(row.extra.html, undefined);
  assert.equal(JSON.stringify(row.extra).includes("SECRET"), false);
  assert.equal(JSON.stringify(row.extra).includes("123456"), false);
});

test("LoggerEmailSender can include plainText in dev-only mode", async () => {
  const entries: Array<{ message: string; extra: Record<string, unknown> }> = [];
  const logger = {
    info(message: string, extra?: Record<string, unknown>) {
      entries.push({ message, extra: extra ?? {} });
    },
    warn() {},
    error() {},
  };
  const sender = new LoggerEmailSender(logger, { includePlainTextBody: true });
  await sender.send({
    to: "user@example.com",
    from: "no-reply@okkey.local",
    subject: "Code",
    text: "Your code: 654321",
    html: "<p>654321</p>",
  });
  const row = entries.find((e) => e.message === "email sent");
  assert.ok(row);
  assert.equal(row.extra.plainText, "Your code: 654321");
});

test("createEmailSender returns LoggerEmailSender for logger provider", async () => {
  const sender = await createEmailSender(baseConfig, {
    info() {},
    warn() {},
    error() {},
  });
  assert.ok(sender instanceof LoggerEmailSender);
});

test("createEmailSender logger logs plainText when nodeEnv is not production", async () => {
  const entries: Array<Record<string, unknown>> = [];
  const logger = {
    info(_message: string, extra?: Record<string, unknown>) {
      entries.push(extra ?? {});
    },
    warn() {},
    error() {},
  };
  const sender = await createEmailSender(
    { ...baseConfig, nodeEnv: "test", emailProvider: "logger" },
    logger,
  );
  await sender.send({
    to: "user@example.com",
    from: "no-reply@okkey.local",
    subject: "Code",
    text: "OTP_BODY",
    html: "<p>x</p>",
  });
  assert.equal(entries[0]?.plainText, "OTP_BODY");
});

test("createEmailSender logger logs plainText when deployEnv is dev even if nodeEnv is production", async () => {
  const entries: Array<Record<string, unknown>> = [];
  const logger = {
    info(_message: string, extra?: Record<string, unknown>) {
      entries.push(extra ?? {});
    },
    warn() {},
    error() {},
  };
  const sender = await createEmailSender(
    { ...baseConfig, nodeEnv: "production", deployEnv: "dev", emailProvider: "logger" },
    logger,
  );
  await sender.send({
    to: "user@example.com",
    from: "no-reply@okkey.local",
    subject: "Code",
    text: "LOCAL_DOCKER",
    html: "<p>x</p>",
  });
  assert.equal(entries[0]?.plainText, "LOCAL_DOCKER");
});

test("createEmailSender logger omits plainText when nodeEnv is production and deployEnv is prod", async () => {
  const entries: Array<Record<string, unknown>> = [];
  const logger = {
    info(_message: string, extra?: Record<string, unknown>) {
      entries.push(extra ?? {});
    },
    warn() {},
    error() {},
  };
  const sender = await createEmailSender(
    { ...baseConfig, nodeEnv: "production", deployEnv: "prod", emailProvider: "logger" },
    logger,
  );
  await sender.send({
    to: "user@example.com",
    from: "no-reply@okkey.local",
    subject: "Code",
    text: "OTP_BODY",
    html: "<p>x</p>",
  });
  assert.equal(entries[0]?.plainText, undefined);
});

test("EMAIL_LOG_PLAINTEXT=true enables plainText when nodeEnv is production", async () => {
  const previous = process.env.EMAIL_LOG_PLAINTEXT;
  process.env.EMAIL_LOG_PLAINTEXT = "true";
  try {
    const entries: Array<Record<string, unknown>> = [];
    const logger = {
      info(_message: string, extra?: Record<string, unknown>) {
        entries.push(extra ?? {});
      },
      warn() {},
      error() {},
    };
    const sender = await createEmailSender(
      { ...baseConfig, nodeEnv: "production", deployEnv: "prod", emailProvider: "logger" },
      logger,
    );
    await sender.send({
      to: "user@example.com",
      from: "no-reply@okkey.local",
      subject: "Code",
      text: "FORCED",
      html: "<p>x</p>",
    });
    assert.equal(entries[0]?.plainText, "FORCED");
  } finally {
    if (previous === undefined) {
      delete process.env.EMAIL_LOG_PLAINTEXT;
    } else {
      process.env.EMAIL_LOG_PLAINTEXT = previous;
    }
  }
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
        { info() {}, warn() {}, error() {} },
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
