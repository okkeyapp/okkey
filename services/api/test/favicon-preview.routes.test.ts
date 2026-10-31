import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  setFaviconHostResolverForTests,
  setFaviconOutboundRequestForTests,
} from "../src/favicon/fetch-remote.ts";
import { ItemFaviconService } from "../src/favicon/service.ts";
import type { RequestContext } from "../src/http.ts";
import { createItemFaviconPreviewRoute } from "../src/routes/item-favicons.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = Buffer.alloc(0);
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  end(chunk?: string | Buffer): void {
    if (chunk) {
      const next = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.body = Buffer.concat([this.body, next]);
    }
    this.writableEnded = true;
  }
}

async function dispatch(body: unknown, userId: string | null = "1000000000000000009"): Promise<MockResponse> {
  const handler = createItemFaviconPreviewRoute(
    new ItemFaviconService({ provider: "direct" }),
    async () => userId,
  );
  const req = {
    method: "POST",
    url: "/favicon/preview",
    headers: { "content-type": "application/json" },
    body,
  } as IncomingMessage & { body?: unknown };
  const res = new MockResponse();
  const ctx: RequestContext = {
    requestId: "req-test",
    req,
    res: res as unknown as ServerResponse,
    params: {},
  };
  await handler(ctx);
  return res;
}

test.afterEach(() => {
  setFaviconHostResolverForTests(null);
  setFaviconOutboundRequestForTests(null);
});

test("POST /favicon/preview returns 401 without auth", async () => {
  const res = await dispatch({ urls: ["https://example.com"] }, null);
  assert.equal(res.statusCode, 401);
});

test("POST /favicon/preview returns 503 FAVICON_UNAVAILABLE when DNS fails", async () => {
  setFaviconHostResolverForTests(async () => {
    throw new Error("ENOTFOUND");
  });
  setFaviconOutboundRequestForTests(async () => {
    throw new Error("should not be called");
  });

  const res = await dispatch({ urls: ["https://unreachable.example.com"] });
  assert.equal(res.statusCode, 503);
  const payload = JSON.parse(res.body.toString()) as { error: string };
  assert.equal(payload.error, "FAVICON_UNAVAILABLE");
});

test("POST /favicon/preview returns 503 when origin returns 5xx", async () => {
  setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
  setFaviconOutboundRequestForTests(async () => ({
    status: 502,
    headers: { "content-type": "text/plain" },
    readBody: async () => new Uint8Array(),
  }));

  const res = await dispatch({ urls: ["https://broken.example.com"] });
  assert.equal(res.statusCode, 503);
  const payload = JSON.parse(res.body.toString()) as { error: string };
  assert.equal(payload.error, "FAVICON_UNAVAILABLE");
});

test("POST /favicon/preview returns 404 when site is reachable without an icon", async () => {
  setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
  setFaviconOutboundRequestForTests(async (url) => {
    if (url.pathname === "/" || url.pathname === "") {
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        readBody: async () => new TextEncoder().encode("<html><head></head></html>"),
      };
    }
    return {
      status: 404,
      headers: {},
      readBody: async () => new Uint8Array(),
    };
  });

  const res = await dispatch({ urls: ["https://no-icon.example.com"] });
  assert.equal(res.statusCode, 404);
  const payload = JSON.parse(res.body.toString()) as { error: string };
  assert.equal(payload.error, "NOT_FOUND");
});

test("POST /favicon/preview returns 200 with image bytes when an icon is found", async () => {
  const icon = new Uint8Array(96);
  icon[0] = 0x89;
  icon[1] = 0x50;
  icon[2] = 0x4e;
  icon[3] = 0x47;

  setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
  setFaviconOutboundRequestForTests(async (url) => {
    if (url.pathname === "/favicon.ico") {
      return {
        status: 200,
        headers: { "content-type": "image/png" },
        readBody: async () => icon,
      };
    }
    if (url.pathname === "/" || url.pathname === "") {
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        readBody: async () => new TextEncoder().encode("<html></html>"),
      };
    }
    return {
      status: 404,
      headers: {},
      readBody: async () => new Uint8Array(),
    };
  });

  const res = await dispatch({ urls: ["https://has-icon.example.com"] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader("content-type"), "image/png");
  assert.equal(res.body.byteLength, 96);
});
