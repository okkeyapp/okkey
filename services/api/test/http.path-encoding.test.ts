import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  decodePathSegment,
  HttpApp,
  HttpRequestError,
  json,
} from "../src/http.ts";

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
}

async function dispatch(
  app: HttpApp,
  method: string,
  url: string,
): Promise<MockResponse> {
  const handler = app.handler();
  const req = { method, url, headers: {} } as IncomingMessage;
  const res = new MockResponse();
  await handler(req, res as unknown as ServerResponse);
  return res;
}

test("decodePathSegment returns decoded value for valid input", () => {
  assert.equal(decodePathSegment("hello%20world"), "hello world");
});

test("decodePathSegment throws HttpRequestError for invalid encoding", () => {
  for (const segment of ["%ZZ", "%", "%E0%A4%A"] as const) {
    assert.throws(
      () => decodePathSegment(segment),
      (error: unknown) =>
        error instanceof HttpRequestError &&
        error.statusCode === 400 &&
        error.code === "BAD_REQUEST",
    );
  }
});

const invalidUrls = [
  "/vaults/%ZZ",
  "/vaults/%",
  "/vaults/%E0%A4%A",
  "/%ZZ",
] as const;

for (const url of invalidUrls) {
  test(`HttpApp returns 400 for invalid path encoding: ${url}`, async () => {
    const app = new HttpApp();
    app.route("GET", "/vaults/:vaultId", async (ctx) => {
      json(ctx.res, 200, { ok: true });
    });

    const res = await dispatch(app, "GET", url);
    assert.equal(res.statusCode, 400);
    assert.equal(res.writableEnded, true);
    const payload = JSON.parse(res.body) as {
      error: string;
      message: string;
      requestId: string;
    };
    assert.equal(payload.error, "BAD_REQUEST");
    assert.match(payload.message, /encoding/i);
    assert.equal(typeof payload.requestId, "string");
  });
}

test("HttpApp decodes valid percent-encoded path params", async () => {
  const app = new HttpApp();
  let capturedId: string | undefined;
  // Use a non-entity-id param name so this asserts decoding, not isEntityId.
  app.route("GET", "/labels/:label", async (ctx) => {
    capturedId = ctx.params.label;
    json(ctx.res, 200, { ok: true });
  });

  const res = await dispatch(app, "GET", "/labels/hello%20world");
  assert.equal(res.statusCode, 200);
  assert.equal(capturedId, "hello world");
});

test("HttpApp accepts percent-encoded valid entity ids on vault routes", async () => {
  const app = new HttpApp();
  let capturedId: string | undefined;
  app.route("GET", "/vaults/:vaultId", async (ctx) => {
    capturedId = ctx.params.vaultId;
    json(ctx.res, 200, { ok: true });
  });

  const res = await dispatch(app, "GET", "/vaults/1000000000%31");
  assert.equal(res.statusCode, 200);
  assert.equal(capturedId, "10000000001");
});

test("HttpApp top-level guard returns 500 without crashing when handler throws", async () => {
  const app = new HttpApp();
  app.route("GET", "/boom", async () => {
    throw new Error("unexpected");
  });

  await assert.doesNotReject(async () => {
    const res = await dispatch(app, "GET", "/boom");
    assert.equal(res.statusCode, 500);
    const payload = JSON.parse(res.body) as { error: string };
    assert.equal(payload.error, "INTERNAL_SERVER_ERROR");
  });
});
