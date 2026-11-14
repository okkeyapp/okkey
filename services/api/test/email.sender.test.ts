import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEmailTransportConfig,
  createEmailSender,
  createOutboundEmailSender,
  createTransportEmailSender,
  EmailTemplateService,
  HttpApiEmailSender,
  isEffectiveOutboundEmailDeliverable,
  isOutboundEmailDeliverable,
  LoggerEmailSender,
  shouldLogUndeliverableAuthCode,
  UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE,
  type EmailMessage,
} from "../src/email/service.ts";
import type { ApiConfig } from "../src/config.ts";
import type { MailDeliverySnapshot } from "../src/mail-settings/types.ts";
import type { Logger } from "../src/logger.ts";
import {
  MemoryEmailQueueRedis,
  QueuedEmailSender,
  resolveDeadLetterSealKey,
  startEmailQueueConsumer,
} from "../src/email/queue.ts";
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

test("createEmailSender logger provider still records email sent", async () => {
  const entries: Array<Record<string, unknown>> = [];
  const sender = await createEmailSender(baseConfig, {
    info(_message: string, extra?: Record<string, unknown>) {
      entries.push(extra ?? {});
    },
    warn() {},
    error() {},
  });
  await sender.send({
    to: "user@example.com",
    from: "no-reply@okkey.local",
    subject: "Hello",
    text: "body",
    html: "<p>body</p>",
  });
  assert.equal(entries[0]?.to, "user@example.com");
  assert.equal(entries[0]?.plainText, "body");
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

type LogEntry = { message: string; extra: Record<string, unknown> };

function captureLogger(): { entries: LogEntry[]; logger: Logger } {
  const entries: LogEntry[] = [];
  return {
    entries,
    logger: {
      info(message, extra) {
        entries.push({ message, extra: extra ?? {} });
      },
      warn() {},
      error() {},
    },
  };
}

function prodConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return createTestApiConfig({
    nodeEnv: "production",
    deployEnv: "prod",
    deploymentMode: "self_hosted",
    emailProvider: "logger",
    emailDeliveryMode: "sync",
    ...overrides,
  });
}

async function withoutPlaintextFlag(run: () => Promise<void>): Promise<void> {
  const previous = process.env.EMAIL_LOG_PLAINTEXT;
  delete process.env.EMAIL_LOG_PLAINTEXT;
  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env.EMAIL_LOG_PLAINTEXT;
    } else {
      process.env.EMAIL_LOG_PLAINTEXT = previous;
    }
  }
}

function templates(sender: { send(message: EmailMessage): Promise<void> }): EmailTemplateService {
  return new EmailTemplateService(sender, {
    from: "no-reply@okkey.local",
    defaultLocale: "en",
    publicAppBaseUrl: "https://app.example.com",
  });
}

test("EMAIL_LOG_PLAINTEXT=true still logs the full auth email body", async () => {
  const previous = process.env.EMAIL_LOG_PLAINTEXT;
  process.env.EMAIL_LOG_PLAINTEXT = "true";
  try {
    const { entries, logger } = captureLogger();
    const sender = await createTransportEmailSender(prodConfig(), logger);
    await templates(sender).sendAuthEmailCode({
      to: "ada@example.com",
      localeHints: { explicitLocale: "en" },
      variables: { code: "654321", ttlSeconds: 300, purpose: "sign_in" },
    });
    const generic = entries.find((entry) => entry.message === "email sent");
    assert.ok(generic);
    assert.match(String(generic.extra.plainText), /654321/);
    assert.match(String(generic.extra.plainText), /Never share this code/);
    const markers = entries.filter((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE);
    assert.equal(markers.length, 1);
    assert.equal(JSON.stringify(markers[0]).includes("Never share this code"), false);
  } finally {
    if (previous === undefined) {
      delete process.env.EMAIL_LOG_PLAINTEXT;
    } else {
      process.env.EMAIL_LOG_PLAINTEXT = previous;
    }
  }
});

test("prod + logger before the undeliverable-mail fallback logs no auth code", async () => {
  // Original problem: production logger mail omits the message body, so a
  // sign-in code never appears in the generic "email sent" line.
  const { entries, logger } = captureLogger();
  const sender = new LoggerEmailSender(logger, { includePlainTextBody: false });
  const code = "654321";
  await sender.send({
    to: "ada@example.com",
    from: "no-reply@okkey.local",
    subject: `${code} is your Okkey verification code`,
    text: `Your Okkey verification code is ${code}. This code will expire in 5 minutes and can only be used once. Never share this code with anyone.`,
    html: `<p>${code}</p>`,
  });
  assert.equal(JSON.stringify(entries).includes(code), false);
  assert.equal(
    entries.some((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE),
    false,
  );
});

test("prod self-host logger logs one masked auth-code line and not the body", async () => {
  await withoutPlaintextFlag(async () => {
    const { entries, logger } = captureLogger();
    const sender = await createTransportEmailSender(
      prodConfig(),
      logger,
    );
    const code = "654321";
    const before = Date.now();
    await templates(sender).sendAuthEmailCode({
      to: "Ada@Example.com",
      localeHints: { explicitLocale: "en" },
      variables: { code, ttlSeconds: 300, purpose: "sign_in" },
    });
    const markers = entries.filter((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE);
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.extra.email, "a***@example.com");
    assert.equal(markers[0]?.extra.code, code);
    const expiresAt = Date.parse(String(markers[0]?.extra.expiresAt));
    assert.equal(Number.isNaN(expiresAt), false);
    assert.ok(expiresAt >= before + 300_000 - 2_000);
    assert.ok(expiresAt <= Date.now() + 300_000 + 2_000);
    const markerJson = JSON.stringify(markers[0]);
    assert.equal(markerJson.includes("Ada@Example.com"), false);
    assert.equal(markerJson.includes("ada@example.com"), false);
    assert.equal(markerJson.includes("Never share this code"), false);
    assert.equal(markerJson.includes("<p>"), false);
    assert.equal(markerJson.includes("plainText"), false);
    const generic = entries.find((entry) => entry.message === "email sent");
    assert.ok(generic);
    assert.equal(JSON.stringify(generic).includes(code), false);
    assert.equal(generic.extra.plainText, undefined);
    const dumped = JSON.stringify(entries);
    assert.equal(dumped.includes("Never share this code"), false);
  });
});

test("prod self-host logger logs registration and email-change codes the same way", async () => {
  await withoutPlaintextFlag(async () => {
    for (const purpose of ["registration", "email_change"] as const) {
      const { entries, logger } = captureLogger();
      const sender = await createTransportEmailSender(prodConfig(), logger);
      const code = purpose === "registration" ? "111222" : "333444";
      await templates(sender).sendAuthEmailCode({
        to: "ada@example.com",
        localeHints: { explicitLocale: "en" },
        variables: { code, ttlSeconds: 600, purpose },
      });
      const markers = entries.filter((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE);
      assert.equal(markers.length, 1);
      assert.equal(markers[0]?.extra.code, code);
      assert.equal(markers[0]?.extra.email, "a***@example.com");
      assert.equal(JSON.stringify(entries).includes("Never share this code"), false);
    }
  });
});

test("prod self-host logger does not log codes from other email types", async () => {
  await withoutPlaintextFlag(async () => {
    const { entries, logger } = captureLogger();
    const sender = await createTransportEmailSender(prodConfig(), logger);
    await sender.send({
      to: "ada@example.com",
      from: "no-reply@okkey.local",
      subject: "Two-factor authentication enabled on Okkey",
      text: "Backup code 111111 SECRET_BODY_PHRASE",
      html: "<p>SECRET_BODY_PHRASE</p>",
    });
    assert.equal(
      entries.some((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE),
      false,
    );
    const dumped = JSON.stringify(entries);
    assert.equal(dumped.includes("111111"), false);
    assert.equal(dumped.includes("SECRET_BODY_PHRASE"), false);
  });
});

function mailSnapshot(overrides: Partial<MailDeliverySnapshot> = {}): MailDeliverySnapshot {
  return {
    smtpHost: "",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    smtpUsername: "",
    smtpPassword: "",
    emailFrom: "no-reply@okkey.local",
    publicAppBaseUrl: "https://app.example.com",
    passwordSet: false,
    passwordUnreadable: false,
    useSmtpTransport: false,
    ...overrides,
  };
}

test("saved SMTP delivers and does not log the auth code when EMAIL_PROVIDER is logger", async () => {
  await withoutPlaintextFlag(async () => {
    const config = prodConfig();
    const saved = mailSnapshot({
      smtpHost: "smtp.example.com",
      smtpUsername: "mailer",
      smtpPassword: "secret",
      passwordSet: true,
      useSmtpTransport: true,
    });
    assert.equal(isOutboundEmailDeliverable(config), false);
    assert.equal(isEffectiveOutboundEmailDeliverable(config, saved), true);

    const { entries, logger } = captureLogger();
    const smtpCalls: string[] = [];
    const sender = await createTransportEmailSender(
      config,
      logger,
      { effective: async () => saved },
      async (_snapshot, message) => {
        smtpCalls.push(message.subject);
      },
    );
    const code = "654321";
    await templates(sender).sendAuthEmailCode({
      to: "ada@example.com",
      localeHints: { explicitLocale: "en" },
      variables: { code, ttlSeconds: 300, purpose: "sign_in" },
    });
    assert.equal(smtpCalls.length, 1);
    assert.equal(
      entries.some((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE),
      false,
    );
    assert.equal(JSON.stringify(entries).includes(code), false);

    const empty = mailSnapshot();
    assert.equal(isEffectiveOutboundEmailDeliverable(config, empty), false);
    const logged = captureLogger();
    const loggerSender = await createTransportEmailSender(config, logged.logger, {
      effective: async () => empty,
    });
    await templates(loggerSender).sendAuthEmailCode({
      to: "ada@example.com",
      localeHints: { explicitLocale: "en" },
      variables: { code, ttlSeconds: 300, purpose: "email_change" },
    });
    const markers = logged.entries.filter(
      (entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE,
    );
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.extra.code, code);

    const envSmtp = prodConfig({ emailProvider: "smtp", smtpHost: "smtp.example.com" });
    assert.equal(
      isEffectiveOutboundEmailDeliverable(envSmtp, mailSnapshot({ useSmtpTransport: false })),
      true,
    );
    assert.equal(shouldLogUndeliverableAuthCode(envSmtp), false);
  });
});

test("saas or deliverable mail does not log the auth code", async () => {
  await withoutPlaintextFlag(async () => {
    assert.equal(
      shouldLogUndeliverableAuthCode(prodConfig({ deploymentMode: "saas" })),
      false,
    );
    assert.equal(
      shouldLogUndeliverableAuthCode(
        prodConfig({ emailProvider: "smtp", smtpHost: "smtp.example.com" }),
      ),
      false,
    );
    assert.equal(shouldLogUndeliverableAuthCode(prodConfig()), true);

    const saas = captureLogger();
    const saasSender = await createTransportEmailSender(
      prodConfig({ deploymentMode: "saas" }),
      saas.logger,
    );
    await templates(saasSender).sendAuthEmailCode({
      to: "ada@example.com",
      localeHints: { explicitLocale: "en" },
      variables: { code: "654321", ttlSeconds: 300, purpose: "sign_in" },
    });
    assert.equal(JSON.stringify(saas.entries).includes("654321"), false);
    assert.equal(
      saas.entries.some((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE),
      false,
    );

    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      calls.push(typeof init?.body === "string" ? init.body : "");
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    try {
      const delivered = captureLogger();
      const httpSender = await createTransportEmailSender(
        prodConfig({
          emailProvider: "http-api",
          emailApiEndpoint: "https://mail.example/send",
          emailApiKey: "key",
        }),
        delivered.logger,
      );
      await templates(httpSender).sendAuthEmailCode({
        to: "ada@example.com",
        localeHints: { explicitLocale: "en" },
        variables: { code: "654321", ttlSeconds: 300, purpose: "registration" },
      });
      assert.equal(JSON.stringify(delivered.entries).includes("654321"), false);
      assert.equal(calls.length, 1);
      const body = JSON.parse(calls[0] ?? "{}") as Record<string, unknown>;
      assert.equal(body.authCodeLog, undefined);
      assert.match(String(body.text), /654321/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("queued prod self-host mail logs the auth code on the worker transport only", async () => {
  await withoutPlaintextFlag(async () => {
    const redis = new MemoryEmailQueueRedis();
    const config = prodConfig({ emailDeliveryMode: "queue" });
    const api = captureLogger();
    const outbound = await createOutboundEmailSender(config, api.logger, redis);
    assert.ok(outbound instanceof QueuedEmailSender);
    const code = "246810";
    await templates(outbound).sendAuthEmailCode({
      to: "ada@example.com",
      localeHints: { explicitLocale: "en" },
      variables: { code, ttlSeconds: 300, purpose: "sign_in" },
    });
    assert.equal(JSON.stringify(api.entries).includes(code), false);

    const worker = captureLogger();
    const transport = await createTransportEmailSender(config, worker.logger);
    const consumer = startEmailQueueConsumer({
      redis,
      transport,
      logger: worker.logger,
      deadLetterSealKey: resolveDeadLetterSealKey(config.emailDeadLetterSealSecret),
      pollTimeoutSeconds: 1,
    });
    for (
      let i = 0;
      i < 40 &&
      !worker.entries.some((entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE);
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await consumer.stop();

    const markers = worker.entries.filter(
      (entry) => entry.message === UNDELIVERABLE_AUTH_CODE_LOG_MESSAGE,
    );
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.extra.email, "a***@example.com");
    assert.equal(markers[0]?.extra.code, code);
    assert.equal(JSON.stringify(worker.entries).includes("Never share this code"), false);
    assert.equal(JSON.stringify(markers[0]).includes("ada@example.com"), false);
  });
});
