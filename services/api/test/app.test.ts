import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

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
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, extra?: Record<string, unknown>) {
      this.errorCalls.push(extra);
    },
  };
}

const testConfig: ApiConfig = createTestApiConfig({
  corsOrigin: "http://localhost:5173,http://localhost:3000",
  databaseUrl: "postgresql://okkey:okkey@localhost:5432/okkey",
  redisUrl: "redis://localhost:6379",
});

async function dispatch(
  method: string,
  url: string,
  logger = createLoggerStub(),
  readyCheck: () => Promise<void> = async () => {},
  headers?: Record<string, string>,
  config: ApiConfig = testConfig,
): Promise<{ res: MockResponse; logger: ReturnType<typeof createLoggerStub> }> {
  const app = createApiApp(config, logger, { readyCheck });
  const handler = app.handler();
  const req = { method, url, headers: headers ?? {} } as IncomingMessage;
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

test("GET /version returns build/version payload", async () => {
  const previous = process.env.OKKEY_VERSION;
  process.env.OKKEY_VERSION = "test-version-1";
  try {
    const { res } = await dispatch("GET", "/version");
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body) as {
      okkey: string;
      enterprise: string | null;
      deploymentMode: string;
      enterpriseModulesEnabled: boolean;
      requestId: string;
    };
    assert.equal(payload.okkey, "test-version-1");
    assert.equal(payload.enterprise, null);
    assert.equal(payload.deploymentMode, "self_hosted");
    assert.equal(payload.enterpriseModulesEnabled, false);
    assert.ok(payload.requestId);
  } finally {
    if (previous === undefined) {
      delete process.env.OKKEY_VERSION;
    } else {
      process.env.OKKEY_VERSION = previous;
    }
  }
});

test("GET /updates/check returns empty when feed not configured", async () => {
  const { res } = await dispatch("GET", "/updates/check");
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as {
    feedConfigured: boolean;
    available: unknown[];
    deploymentMode: string;
  };
  assert.equal(payload.deploymentMode, "self_hosted");
  assert.equal(payload.feedConfigured, false);
  assert.deepEqual(payload.available, []);
});

test("GET /updates/check returns from→to from mock feed path", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-updates-check-"));
  const feedPath = path.join(dir, "feed.json");
  writeFileSync(
    feedPath,
    JSON.stringify({
      schemaVersion: 1,
      components: [{ id: "okkey", version: "9.9.9", notes: "mock staging" }],
    }),
    "utf8",
  );
  const previous = process.env.OKKEY_VERSION;
  process.env.OKKEY_VERSION = "1.0.0";
  try {
    const config = createTestApiConfig({
      corsOrigin: "http://localhost:5173,http://localhost:3000",
      databaseUrl: "postgresql://okkey:okkey@localhost:5432/okkey",
      redisUrl: "redis://localhost:6379",
      updateFeedPath: feedPath,
    });
    const { res } = await dispatch("GET", "/updates/check", createLoggerStub(), async () => {}, undefined, config);
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body) as {
      feedConfigured: boolean;
      available: Array<{ id: string; from: string; to: string; notes: string | null }>;
    };
    assert.equal(payload.feedConfigured, true);
    assert.equal(payload.available.length, 1);
    assert.equal(payload.available[0]?.id, "okkey");
    assert.equal(payload.available[0]?.from, "1.0.0");
    assert.equal(payload.available[0]?.to, "9.9.9");
    assert.equal(payload.available[0]?.notes, "mock staging");
  } finally {
    if (previous === undefined) {
      delete process.env.OKKEY_VERSION;
    } else {
      process.env.OKKEY_VERSION = previous;
    }
  }
});

test("POST /updates/apply returns 501 until update agent exists", async () => {
  const { res } = await dispatch("POST", "/updates/apply");
  assert.equal(res.statusCode, 501);
  const payload = JSON.parse(res.body) as {
    error: string;
    applied: boolean;
    deploymentMode: string;
  };
  assert.equal(payload.error, "UPDATE_APPLY_UNAVAILABLE");
  assert.equal(payload.applied, false);
  assert.equal(payload.deploymentMode, "self_hosted");
});

test("unknown route returns 404", async () => {
  const { res } = await dispatch("GET", "/missing");
  assert.equal(res.statusCode, 404);

  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "NOT_FOUND");
});

test("OPTIONS request is handled by cors middleware", async () => {
  const { res } = await dispatch("OPTIONS", "/health", createLoggerStub(), async () => {}, {
    origin: "http://localhost:5173",
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(res.writableEnded, true);
  const allowHeaders = String(res.getHeader("access-control-allow-headers") ?? "").toLowerCase();
  assert.match(allowHeaders, /x-device-fingerprint/);
  assert.match(allowHeaders, /x-device-id/);
  assert.match(allowHeaders, /authorization/);
  assert.match(allowHeaders, /x-attachment-purpose/);
  assert.match(allowHeaders, /x-encrypted-key/);
});

test("OPTIONS echoes matching origin from comma-separated CORS_ORIGIN", async () => {
  const { res } = await dispatch("OPTIONS", "/health", createLoggerStub(), async () => {}, {
    origin: "http://localhost:3000",
  });
  assert.equal(res.getHeader("access-control-allow-origin"), "http://localhost:3000");
});

test("OPTIONS omits Allow-Origin when Origin is not allowed", async () => {
  const { res } = await dispatch("OPTIONS", "/health", createLoggerStub(), async () => {}, {
    origin: "http://evil.example",
  });
  assert.equal(res.getHeader("access-control-allow-origin"), undefined);
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
