import test from "node:test";
import assert from "node:assert/strict";
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
