import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }
}

function createLoggerStub() {
  return {
    infoCalls: [] as Array<Record<string, unknown> | undefined>,
    errorCalls: [] as Array<Record<string, unknown> | undefined>,
    info(_message: string, extra?: Record<string, unknown>) {
      this.infoCalls.push(extra);
    },
    error(_message: string, extra?: Record<string, unknown>) {
      this.errorCalls.push(extra);
    },
  };
}

const testConfig: ApiConfig = {
  nodeEnv: "test",
  port: 4000,
  logLevel: "debug",
  corsOrigin: "http://localhost:3000",
  databaseUrl: "postgresql://okkey:okkey@localhost:5432/okkey",
  redisUrl: "redis://localhost:6379",
  authCodeTtlSeconds: 300,
  authResendCooldownSeconds: 60,
  authCodeMaxAttempts: 5,
  authRateLimitWindowSeconds: 600,
  authRateLimitStartPerEmail: 5,
  authRateLimitStartPerIp: 10,
  authRateLimitConfirmPerIp: 30,
  authRateLimitResendPerIp: 10,
  registrationAuthStateTtlSeconds: 3600,
  registrationResultTtlSeconds: 604800,
  deviceApprovalTtlSeconds: 600,
  defaultEmailLocale: "en",
  emailFrom: "no-reply@okkey.local",
};

async function dispatch(
  method: string,
  url: string,
  logger = createLoggerStub(),
  readyCheck: () => Promise<void> = async () => {},
): Promise<{ res: MockResponse; logger: ReturnType<typeof createLoggerStub> }> {
  const app = createApiApp(testConfig, logger, { readyCheck });
  const handler = app.handler();
  const req = { method, url } as IncomingMessage;
  const res = new MockResponse();

  await handler(req, res as unknown as ServerResponse);

  return { res, logger };
}

test("GET /health returns 200 and ok status payload", async () => {
  const { res } = await dispatch("GET", "/health");
  assert.equal(res.statusCode, 200);
  assert.equal(
    res.getHeader("content-type"),
    "application/json; charset=utf-8",
  );

  const payload = JSON.parse(res.body) as { status: string; service: string };
  assert.equal(payload.status, "ok");
  assert.equal(payload.service, "okkey-api");
});

test("unknown route returns 404", async () => {
  const { res } = await dispatch("GET", "/missing");
  assert.equal(res.statusCode, 404);

  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "NOT_FOUND");
});

test("OPTIONS request is handled by cors middleware", async () => {
  const { res } = await dispatch("OPTIONS", "/health");
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader("access-control-allow-origin"), testConfig.corsOrigin);
  assert.equal(res.writableEnded, true);
});

test("error middleware catches thrown handler error and returns 500", async () => {
  const logger = createLoggerStub();
  const app = createApiApp(testConfig, logger);
  app.route("GET", "/boom", async () => {
    throw new Error("boom");
  });

  const handler = app.handler();
  const req = { method: "GET", url: "/boom" } as IncomingMessage;
  const res = new MockResponse();

  await handler(req, res as unknown as ServerResponse);

  assert.equal(res.statusCode, 500);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "INTERNAL_SERVER_ERROR");
  assert.equal(logger.errorCalls.length, 1);
});

test("GET /ready returns 200 when readiness check is successful", async () => {
  const { res } = await dispatch("GET", "/ready", createLoggerStub(), async () => {});
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as { status: string };
  assert.equal(payload.status, "ready");
});

test("GET /ready returns 503 when readiness check fails", async () => {
  const { res } = await dispatch(
    "GET",
    "/ready",
    createLoggerStub(),
    async () => {
      throw new Error("storage unavailable");
    },
  );
  assert.equal(res.statusCode, 503);
  const payload = JSON.parse(res.body) as { status: string };
  assert.equal(payload.status, "not_ready");
});
