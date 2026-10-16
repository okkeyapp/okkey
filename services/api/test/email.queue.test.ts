import test from "node:test";
import assert from "node:assert/strict";
import {
  EmailTemplateError,
  isRetryableEmailSendFailure,
} from "../src/email/errors.ts";
import {
  EMAIL_DEAD_KEY,
  EMAIL_DELAYED_KEY,
  EMAIL_QUEUE_KEY,
  MemoryEmailQueueRedis,
  QueuedEmailSender,
  computeEmailRetryDelayMs,
  parseEmailJob,
  resolveEmailDeliveryMode,
  serializeEmailJob,
  startEmailQueueConsumer,
  type EmailJob,
} from "../src/email/queue.ts";
/** Minimal message shape (avoid importing email/service.ts → @okkey/email-templates). */
type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

type EmailSender = {
  send(message: EmailMessage): Promise<void>;
};

const sampleMessage: EmailMessage = {
  to: "user@example.com",
  from: "no-reply@okkey.local",
  subject: "Hello",
  text: "body",
  html: "<p>body</p>",
};

function transportErrorWithStatus(status: number, message: string): EmailTemplateError {
  return new EmailTemplateError("EMAIL_TRANSPORT_ERROR", message, { status });
}

test("resolveEmailDeliveryMode defaults queue in production, sync elsewhere", () => {
  assert.equal(resolveEmailDeliveryMode("production", undefined), "queue");
  assert.equal(resolveEmailDeliveryMode("development", undefined), "sync");
  assert.equal(resolveEmailDeliveryMode("test", undefined), "sync");
  assert.equal(resolveEmailDeliveryMode("production", "sync"), "sync");
  assert.equal(resolveEmailDeliveryMode("development", "queue"), "queue");
});

test("computeEmailRetryDelayMs exponential backoff with cap", () => {
  assert.equal(computeEmailRetryDelayMs(1, { backoffBaseMs: 1000, maxBackoffMs: 10_000 }), 1000);
  assert.equal(computeEmailRetryDelayMs(2, { backoffBaseMs: 1000, maxBackoffMs: 10_000 }), 2000);
  assert.equal(computeEmailRetryDelayMs(5, { backoffBaseMs: 1000, maxBackoffMs: 10_000 }), 10_000);
});

test("isRetryableEmailSendFailure treats permanent 4xx as non-retryable", () => {
  assert.equal(isRetryableEmailSendFailure(new Error("smtp down")), true);
  assert.equal(
    isRetryableEmailSendFailure(transportErrorWithStatus(400, "email api send failed: status 400")),
    false,
  );
  assert.equal(
    isRetryableEmailSendFailure(transportErrorWithStatus(403, "ses send failed: status 403")),
    false,
  );
  assert.equal(
    isRetryableEmailSendFailure(transportErrorWithStatus(429, "email api send failed: status 429")),
    true,
  );
  assert.equal(
    isRetryableEmailSendFailure(transportErrorWithStatus(500, "ses send failed: status 500")),
    true,
  );
  assert.equal(
    isRetryableEmailSendFailure(
      new EmailTemplateError("EMAIL_TRANSPORT_ERROR", "network blip", { cause: "ECONNRESET" }),
    ),
    true,
  );
});

test("QueuedEmailSender pushes serialized jobs to Redis list", async () => {
  const redis = new MemoryEmailQueueRedis();
  const sender = new QueuedEmailSender(redis);
  await sender.send(sampleMessage);
  const queued = redis.peekList(EMAIL_QUEUE_KEY);
  assert.equal(queued.length, 1);
  const job = parseEmailJob(queued[0]!);
  assert.equal(job.message.to, sampleMessage.to);
  assert.equal(job.attempts, 0);
  assert.ok(job.id.length > 0);
});

test("QueuedEmailSender and consumer log redacted subjects", async () => {
  const redis = new MemoryEmailQueueRedis();
  const entries: Array<{ message: string; extra: Record<string, unknown> }> = [];
  const logger = {
    info(message: string, extra?: Record<string, unknown>) {
      entries.push({ message, extra: extra ?? {} });
    },
    warn() {},
    error() {},
  };
  const codeSubject = "146805 is your Okkey email change code";
  const message: EmailMessage = {
    ...sampleMessage,
    subject: codeSubject,
  };
  await new QueuedEmailSender(redis, logger).send(message);
  const queuedRaw = redis.peekList(EMAIL_QUEUE_KEY)[0]!;
  assert.equal(parseEmailJob(queuedRaw).message.subject, codeSubject);

  const enqueued = entries.find((e) => e.message === "email enqueued");
  assert.ok(enqueued);
  assert.equal(enqueued.extra.subject, "****** is your Okkey email change code");
  assert.equal(JSON.stringify(enqueued.extra).includes("146805"), false);

  const transport: EmailSender = {
    async send() {},
  };
  const consumer = startEmailQueueConsumer({
    redis,
    transport,
    logger,
    pollTimeoutSeconds: 1,
  });
  for (let i = 0; i < 40 && !entries.some((e) => e.message === "email job sent"); i += 1) {
    await new Promise((r) => setTimeout(r, 25));
  }
  await consumer.stop();

  const sent = entries.find((e) => e.message === "email job sent");
  assert.ok(sent);
  assert.equal(sent.extra.subject, "****** is your Okkey email change code");
  assert.equal(JSON.stringify(sent.extra).includes("146805"), false);
});

test("email queue consumer sends via transport and clears queue", async () => {
  const redis = new MemoryEmailQueueRedis();
  const sent: EmailMessage[] = [];
  const transport: EmailSender = {
    async send(message) {
      sent.push(message);
    },
  };
  const consumer = startEmailQueueConsumer({
    redis,
    transport,
    logger: { info() {}, warn() {}, error() {} },
    pollTimeoutSeconds: 1,
  });

  await new QueuedEmailSender(redis).send(sampleMessage);

  for (let i = 0; i < 40 && sent.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
  }
  await consumer.stop();

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, sampleMessage.to);
  assert.equal(redis.peekList(EMAIL_QUEUE_KEY).length, 0);
});

test("email queue consumer retries then dead-letters", async () => {
  const redis = new MemoryEmailQueueRedis();
  let calls = 0;
  const transport: EmailSender = {
    async send() {
      calls += 1;
      throw new Error("smtp down");
    },
  };
  const consumer = startEmailQueueConsumer({
    redis,
    transport,
    logger: { info() {}, warn() {}, error() {} },
    pollTimeoutSeconds: 1,
    options: { maxAttempts: 2, backoffBaseMs: 1, maxBackoffMs: 1 },
  });

  const job: EmailJob = {
    id: "job-1",
    createdAt: new Date().toISOString(),
    attempts: 0,
    message: sampleMessage,
  };
  await redis.lPush(EMAIL_QUEUE_KEY, serializeEmailJob(job));

  for (let i = 0; i < 80 && redis.peekList(EMAIL_DEAD_KEY).length === 0; i += 1) {
    // Promote delayed immediately for the test by moving zset members with score in the past.
    // Consumer promotes on each loop; with 1ms backoff this should finish quickly.
    await new Promise((r) => setTimeout(r, 20));
  }
  await consumer.stop();

  assert.ok(calls >= 2);
  assert.equal(redis.peekList(EMAIL_DEAD_KEY).length, 1);
  const dead = parseEmailJob(redis.peekList(EMAIL_DEAD_KEY)[0]!);
  assert.equal(dead.attempts, 2);
  assert.match(dead.lastError ?? "", /smtp down/);
  assert.equal(redis.peekList(EMAIL_QUEUE_KEY).length, 0);
  // delayed should be empty after dead-letter
  const delayed = await redis.zRangeByScore(EMAIL_DELAYED_KEY, 0, Number.MAX_SAFE_INTEGER, 10);
  assert.equal(delayed.length, 0);
});


test("email queue dead-letter lastError includes transport cause", async () => {
  const redis = new MemoryEmailQueueRedis();
  const transport: EmailSender = {
    async send() {
      throw new EmailTemplateError("EMAIL_TRANSPORT_ERROR", "smtp send failed", {
        cause: "connect ECONNREFUSED 127.0.0.1:4019",
      });
    },
  };
  const consumer = startEmailQueueConsumer({
    redis,
    transport,
    logger: { info() {}, warn() {}, error() {} },
    pollTimeoutSeconds: 1,
    options: { maxAttempts: 1, backoffBaseMs: 1, maxBackoffMs: 1 },
  });

  const job: EmailJob = {
    id: "job-cause",
    createdAt: new Date().toISOString(),
    attempts: 0,
    message: sampleMessage,
  };
  await redis.lPush(EMAIL_QUEUE_KEY, serializeEmailJob(job));

  for (let i = 0; i < 80 && redis.peekList(EMAIL_DEAD_KEY).length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
  await consumer.stop();

  assert.equal(redis.peekList(EMAIL_DEAD_KEY).length, 1);
  const dead = parseEmailJob(redis.peekList(EMAIL_DEAD_KEY)[0]!);
  assert.match(dead.lastError ?? "", /smtp send failed/);
  assert.match(dead.lastError ?? "", /ECONNREFUSED 127\.0\.0\.1:4019/);
});

test("email queue consumer dead-letters permanent HTTP 4xx without retry", async () => {
  const redis = new MemoryEmailQueueRedis();
  let calls = 0;
  const transport: EmailSender = {
    async send() {
      calls += 1;
      throw transportErrorWithStatus(403, "ses send failed: status 403");
    },
  };
  const consumer = startEmailQueueConsumer({
    redis,
    transport,
    logger: { info() {}, warn() {}, error() {} },
    pollTimeoutSeconds: 1,
    options: { maxAttempts: 5, backoffBaseMs: 1, maxBackoffMs: 1 },
  });

  const job: EmailJob = {
    id: "job-4xx",
    createdAt: new Date().toISOString(),
    attempts: 0,
    message: sampleMessage,
  };
  await redis.lPush(EMAIL_QUEUE_KEY, serializeEmailJob(job));

  for (let i = 0; i < 40 && redis.peekList(EMAIL_DEAD_KEY).length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
  }
  await consumer.stop();

  assert.equal(calls, 1);
  assert.equal(redis.peekList(EMAIL_DEAD_KEY).length, 1);
  const dead = parseEmailJob(redis.peekList(EMAIL_DEAD_KEY)[0]!);
  assert.equal(dead.attempts, 1);
  assert.match(dead.lastError ?? "", /status 403/);
  const delayed = await redis.zRangeByScore(EMAIL_DELAYED_KEY, 0, Number.MAX_SAFE_INTEGER, 10);
  assert.equal(delayed.length, 0);
});

test("email queue consumer still retries HTTP 429", async () => {
  const redis = new MemoryEmailQueueRedis();
  let calls = 0;
  const transport: EmailSender = {
    async send() {
      calls += 1;
      throw transportErrorWithStatus(429, "email api send failed: status 429");
    },
  };
  const consumer = startEmailQueueConsumer({
    redis,
    transport,
    logger: { info() {}, warn() {}, error() {} },
    pollTimeoutSeconds: 1,
    options: { maxAttempts: 2, backoffBaseMs: 1, maxBackoffMs: 1 },
  });

  const job: EmailJob = {
    id: "job-429",
    createdAt: new Date().toISOString(),
    attempts: 0,
    message: sampleMessage,
  };
  await redis.lPush(EMAIL_QUEUE_KEY, serializeEmailJob(job));

  for (let i = 0; i < 80 && redis.peekList(EMAIL_DEAD_KEY).length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
  await consumer.stop();

  assert.ok(calls >= 2);
  assert.equal(redis.peekList(EMAIL_DEAD_KEY).length, 1);
  const dead = parseEmailJob(redis.peekList(EMAIL_DEAD_KEY)[0]!);
  assert.equal(dead.attempts, 2);
  assert.match(dead.lastError ?? "", /status 429/);
});
