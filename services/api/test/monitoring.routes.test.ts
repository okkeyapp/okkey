import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(_name: string, _value: string): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const config: ApiConfig = createTestApiConfig();

async function dispatch(method: string, url: string) {
  const app = createApiApp(config, loggerStub(), {});
  const req = {
    method,
    url,
    headers: { "x-user-id": "u1", "content-type": "application/json" },
    body: {},
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("password monitoring routes are 404 without an optional module", async () => {
  for (const [method, url] of [
    ["GET", "/monitoring"],
    ["POST", "/monitoring"],
    ["GET", "/workspaces/w1/monitoring"],
    ["PATCH", "/workspaces/w1/monitoring"],
    ["PUT", "/workspaces/w1/monitoring"],
    ["GET", "/workspaces/w1/monitoring/card-settings"],
    ["PATCH", "/workspaces/w1/monitoring/card-settings"],
    ["PUT", "/workspaces/w1/monitoring/card-settings"],
    ["POST", "/workspaces/w1/monitoring/hibp"],
  ] as const) {
    const res = await dispatch(method, url);
    assert.equal(res.statusCode, 404, `${method} ${url}`);
  }
});
