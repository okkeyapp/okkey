import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  detectFaviconImageMediaType,
  setFaviconHostResolverForTests,
  setFaviconOutboundRequestForTests,
  type FaviconRemoteLookupResult,
} from "../src/favicon/fetch-remote.ts";
import { ItemFaviconService } from "../src/favicon/service.ts";
import type { RequestContext } from "../src/http.ts";
import {
  createItemFaviconConfigRoute,
  createItemFaviconPreviewRoute,
  FAVICON_SVG_PREVIEW_CONTENT_SECURITY_POLICY,
} from "../src/routes/item-favicons.ts";

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

async function dispatch(
  body: unknown,
  userId: string | null = "1000000000000000009",
  provider: "direct" | "off" | "client" = "direct",
): Promise<MockResponse> {
  const handler = createItemFaviconPreviewRoute(
    new ItemFaviconService({ provider }),
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

test("POST /favicon/preview is disabled without reading urls when the provider is off", async () => {
  let fetched = false;
  let bodyRead = false;
  setFaviconOutboundRequestForTests(async () => {
    fetched = true;
    throw new Error("should not fetch");
  });
  const handler = createItemFaviconPreviewRoute(
    new ItemFaviconService({ provider: "off" }),
    async () => "1000000000000000009",
  );
  const req = {
    method: "POST",
    url: "/favicon/preview",
    headers: { "content-type": "application/json" },
    get body() {
      bodyRead = true;
      return { urls: ["https://secret.example/login"] };
    },
  } as IncomingMessage & { body?: unknown };
  const res = new MockResponse();
  await handler({
    requestId: "req-off",
    req,
    res: res as unknown as ServerResponse,
    params: {},
  });
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body.toString()) as { error: string; message: string };
  assert.equal(payload.error, "FAVICON_DISABLED");
  assert.match(payload.message, /disabled/i);
  assert.equal(fetched, false);
  assert.equal(bodyRead, false);

  const clientMode = await dispatch({ urls: ["https://secret.example/login"] }, "1000000000000000009", "client");
  assert.equal(clientMode.statusCode, 403);
  assert.equal(JSON.parse(clientMode.body.toString()).error, "FAVICON_DISABLED");
  assert.equal(fetched, false);
});

test("GET /favicon/config reports off by default and direct when opted in", async () => {
  const off = new MockResponse();
  await createItemFaviconConfigRoute(new ItemFaviconService())({
    requestId: "req-config-off",
    req: { method: "GET", url: "/favicon/config", headers: {} } as IncomingMessage,
    res: off as unknown as ServerResponse,
    params: {},
  });
  assert.equal(off.statusCode, 200);
  assert.equal(JSON.parse(off.body.toString()).provider, "off");

  const direct = new MockResponse();
  await createItemFaviconConfigRoute(new ItemFaviconService({ provider: "direct" }))({
    requestId: "req-config-direct",
    req: { method: "GET", url: "/favicon/config", headers: {} } as IncomingMessage,
    res: direct as unknown as ServerResponse,
    params: {},
  });
  assert.equal(JSON.parse(direct.body.toString()).provider, "direct");
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
  assert.equal(res.getHeader("x-content-type-options"), "nosniff");
  assert.equal(res.body.byteLength, 96);
});

function rasterBytes(prefix: number[]): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set(prefix);
  return bytes;
}

test("detectFaviconImageMediaType maps magic bytes and rejects non-images", () => {
  assert.equal(detectFaviconImageMediaType(rasterBytes([0x89, 0x50, 0x4e, 0x47])), "image/png");
  assert.equal(detectFaviconImageMediaType(rasterBytes([0x00, 0x00, 0x01, 0x00])), "image/x-icon");
  assert.equal(detectFaviconImageMediaType(rasterBytes([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectFaviconImageMediaType(rasterBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), "image/gif");
  const webp = rasterBytes([0x52, 0x49, 0x46, 0x46]);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  assert.equal(detectFaviconImageMediaType(webp), "image/webp");
  assert.equal(
    detectFaviconImageMediaType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    "image/svg+xml",
  );
  assert.equal(
    detectFaviconImageMediaType(new TextEncoder().encode("<!doctype html><html><body>nope</body></html>")),
    null,
  );
  assert.equal(detectFaviconImageMediaType(new TextEncoder().encode("%PDF-1.7 not an image")), null);
  assert.equal(detectFaviconImageMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
});

test("POST /favicon/preview sends the detected ICO type and nosniff", async () => {
  const icon = new Uint8Array(64);
  icon.set([0x00, 0x00, 0x01, 0x00]);
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
    return { status: 404, headers: {}, readBody: async () => new Uint8Array() };
  });

  const res = await dispatch({ urls: ["https://ico.example.com"] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader("content-type"), "image/x-icon");
  assert.equal(res.getHeader("x-content-type-options"), "nosniff");
  assert.equal(res.getHeader("content-disposition"), undefined);
  assert.deepEqual(res.body, Buffer.from(icon));
});

test("POST /favicon/preview sends SVG as image/svg+xml with document headers", async () => {
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><script>alert(1)</script><rect width="32" height="32"/></svg>',
  );
  setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
  setFaviconOutboundRequestForTests(async (url) => {
    if (url.pathname === "/" || url.pathname === "") {
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        readBody: async () =>
          new TextEncoder().encode('<html><head><link rel="icon" type="image/svg+xml" href="/icon.svg"></head></html>'),
      };
    }
    if (url.pathname === "/icon.svg") {
      return {
        status: 200,
        headers: { "content-type": "image/png" },
        readBody: async () => svg,
      };
    }
    return { status: 404, headers: {}, readBody: async () => new Uint8Array() };
  });

  const res = await dispatch({ urls: ["https://svg-only.example.com/"] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader("content-type"), "image/svg+xml");
  assert.equal(res.getHeader("x-content-type-options"), "nosniff");
  assert.equal(res.getHeader("content-security-policy"), FAVICON_SVG_PREVIEW_CONTENT_SECURITY_POLICY);
  assert.equal(res.getHeader("content-disposition"), "attachment");
  assert.deepEqual(res.body, Buffer.from(svg));
});

test("POST /favicon/preview rejects a non-image payload", async () => {
  class NonImagePreviewService extends ItemFaviconService {
    override async previewFromUrls(): Promise<FaviconRemoteLookupResult> {
      return {
        status: "found",
        bytes: new TextEncoder().encode("<!doctype html><html><body>not an icon</body></html>"),
      };
    }
  }

  const handler = createItemFaviconPreviewRoute(
    new NonImagePreviewService({ provider: "direct" }),
    async () => "1000000000000000009",
  );
  const req = {
    method: "POST",
    url: "/favicon/preview",
    headers: { "content-type": "application/json" },
    body: { urls: ["https://html.example.com"] },
  } as IncomingMessage & { body?: unknown };
  const res = new MockResponse();
  await handler({
    requestId: "req-not-image",
    req,
    res: res as unknown as ServerResponse,
    params: {},
  });

  assert.equal(res.statusCode, 415);
  assert.equal(res.getHeader("x-content-type-options"), "nosniff");
  assert.equal(res.getHeader("content-type"), "application/json; charset=utf-8");
  const payload = JSON.parse(res.body.toString()) as { error: string };
  assert.equal(payload.error, "UNSUPPORTED_MEDIA_TYPE");
});
