import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEmailTransportConfig,
  createEmailSender,
  createOutboundEmailSender,
  HttpApiEmailSender,
  isOutboundEmailDeliverable,
  LoggerEmailSender,
  type EmailMessage,
} from "../src/email/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { MemoryEmailQueueRedis, QueuedEmailSender } from "../src/email/queue.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const baseConfig: ApiConfig = createTestApiConfig({ emailApiTimeoutMs: 1000 });

test("LoggerEmailSender info log omits text/html and redacts digits in subject", async () => {
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
    subject: "123456 is your Okkey sign-in code",
    text: "SECRET_PLAIN_BODY_123456",
    html: "<p>SECRET_HTML_123456</p>",
  };
  await sender.send(payload);
  const row = entries.find((e) => e.message === "email sent");
  assert.ok(row);
  assert.equal(row.extra.subject, "****** is your Okkey sign-in code");
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

test("createEmailSender validates ses config", async () => {
  await assert.rejects(
    () =>
      createEmailSender(
        {
          ...baseConfig,
          emailProvider: "ses",
          sesRegion: "",
          sesAccessKeyId: "id",
          sesSecretAccessKey: "secret",
        },
        { info() {}, warn() {}, error() {} },
      ),
    /EMAIL_SES_REGION is required/,
  );
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

test("assertEmailTransportConfig rejects incomplete ses env", () => {
  assert.throws(
    () =>
      assertEmailTransportConfig({
        ...baseConfig,
        emailProvider: "ses",
        sesRegion: "",
        sesAccessKeyId: "id",
        sesSecretAccessKey: "secret",
      }),
    /EMAIL_SES_REGION is required/,
  );
});

test("isOutboundEmailDeliverable is false for logger and incomplete providers", () => {
  assert.equal(
    isOutboundEmailDeliverable({ ...baseConfig, emailProvider: "logger" }),
    false,
  );
  assert.equal(
    isOutboundEmailDeliverable({
      ...baseConfig,
      emailProvider: "smtp",
      smtpHost: "smtp.example.com",
    }),
    true,
  );
  assert.equal(
    isOutboundEmailDeliverable({ ...baseConfig, emailProvider: "smtp", smtpHost: "  " }),
    false,
  );
  assert.equal(
    isOutboundEmailDeliverable({
      ...baseConfig,
      emailProvider: "ses",
      sesRegion: "",
      sesAccessKeyId: "id",
      sesSecretAccessKey: "secret",
    }),
    false,
  );
  assert.equal(
    isOutboundEmailDeliverable({
      ...baseConfig,
      emailProvider: "http-api",
      emailApiEndpoint: "https://mail.example/send",
      emailApiKey: "k",
    }),
    true,
  );
});

test("createOutboundEmailSender validates transport even in queue mode", async () => {
  const redis = new MemoryEmailQueueRedis();
  await assert.rejects(
    () =>
      createOutboundEmailSender(
        {
          ...baseConfig,
          emailProvider: "ses",
          emailDeliveryMode: "queue",
          sesRegion: "",
          sesAccessKeyId: "id",
          sesSecretAccessKey: "secret",
        },
        { info() {}, warn() {}, error() {} },
        redis,
      ),
    /EMAIL_SES_REGION is required/,
  );
});

test("createOutboundEmailSender returns QueuedEmailSender when queue mode is valid", async () => {
  const redis = new MemoryEmailQueueRedis();
  const sender = await createOutboundEmailSender(
    {
      ...baseConfig,
      emailProvider: "logger",
      emailDeliveryMode: "queue",
    },
    { info() {}, warn() {}, error() {} },
    redis,
  );
  assert.ok(sender instanceof QueuedEmailSender);
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

test("SesEmailSender posts SigV4-signed SES v2 payload", async () => {
  const { SesEmailSender } = await import("../src/email/ses-sender.ts");
  const calls: Array<{ url: string; authorization: string | null; body: string | null }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      authorization: headers.get("authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const sender = new SesEmailSender({
    region: "eu-west-1",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secret",
    fetchImpl,
  });
  await sender.send({
    to: "user@example.com",
    from: "no-reply@okkey.local",
    subject: "Code",
    text: "123456",
    html: '<p><img src="cid:okkey-mark" alt="Okkey" />123456</p>',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
  assert.match(calls[0].authorization ?? "", /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\//);
  assert.match(calls[0].body ?? "", /"FromEmailAddress":"no-reply@okkey.local"/);
  assert.match(calls[0].body ?? "", /"Raw":\{"Data":"/);
  assert.equal((calls[0].body ?? "").includes('"Simple"'), false);
  const parsed = JSON.parse(calls[0].body ?? "{}") as {
    Content?: { Raw?: { Data?: string } };
  };
  const raw = Buffer.from(parsed.Content?.Raw?.Data ?? "", "base64").toString("utf8");
  assert.match(raw, /Content-ID: <okkey-mark>/);
  assert.match(raw, /image\/png/);
  const htmlB64 = Buffer.from(
    '<p><img src="cid:okkey-mark" alt="Okkey" />123456</p>',
    "utf8",
  ).toString("base64");
  assert.ok(raw.includes(htmlB64), "raw MIME must include base64 HTML with cid:okkey-mark");
});
