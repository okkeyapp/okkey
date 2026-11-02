/**
 * End-to-end: real ItemFaviconService route on a listening HTTP server →
 * client-shaped fetch mapping (same status rules as apps/web previewItemFavicon).
 *
 * Unreachable sites must surface as unavailable (503), not absent (404).
 */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, test } from "node:test";

import {
  setFaviconHostResolverForTests,
  setFaviconOutboundRequestForTests,
} from "../src/favicon/fetch-remote.ts";
import { ItemFaviconService } from "../src/favicon/service.ts";
import type { RequestContext } from "../src/http.ts";
import { createItemFaviconPreviewRoute } from "../src/routes/item-favicons.ts";

async function startPreviewServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const route = createItemFaviconPreviewRoute(
    new ItemFaviconService({ provider: "direct" }),
    async (req) => {
      const auth = req.headers.authorization ?? "";
      return auth === "Bearer test-access-token" ? "1000000000000000009" : null;
    },
  );

  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = undefined;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      const enriched = Object.assign(req, { body }) as IncomingMessage & { body?: unknown };
      const ctx: RequestContext = {
        requestId: "e2e-req",
        req: enriched,
        res,
        params: {},
      };
      await route(ctx);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end();
      }
    })().catch(() => {
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end();
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to start favicon preview test server");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

/**
 * Mirrors apps/web/src/api/item-favicons.ts `previewItemFavicon` status mapping:
 * 404 → null (absent), 503 → throw unavailable, other errors → throw, 200 → blob.
 */
async function previewItemFaviconClient(
  baseUrl: string,
  accessToken: string,
  urls: readonly string[],
): Promise<Blob | null> {
  const response = await fetch(`${baseUrl}/favicon/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ urls: [...urls] }),
  });

  if (response.status === 404) {
    return null;
  }
  if (response.status === 503) {
    throw new Error("FAVICON_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.blob();
}

type ClientLookupStatus = "found" | "absent" | "unavailable";

async function lookupStatus(
  baseUrl: string,
  urls: readonly string[],
): Promise<ClientLookupStatus> {
  try {
    const blob = await previewItemFaviconClient(baseUrl, "test-access-token", urls);
    return blob ? "found" : "absent";
  } catch {
    return "unavailable";
  }
}

afterEach(() => {
  setFaviconHostResolverForTests(null);
  setFaviconOutboundRequestForTests(null);
});

test("e2e server→client: DNS failure maps to unavailable (not absent)", async () => {
  setFaviconHostResolverForTests(async () => {
    throw new Error("ENOTFOUND");
  });
  setFaviconOutboundRequestForTests(async () => {
    throw new Error("should not be called");
  });

  const server = await startPreviewServer();
  try {
    assert.equal(
      await lookupStatus(server.baseUrl, ["https://dns-fail.example.com"]),
      "unavailable",
    );
  } finally {
    await server.close();
  }
});

test("e2e server→client: connection refused maps to unavailable", async () => {
  setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
  setFaviconOutboundRequestForTests(async () => {
    throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  });

  const server = await startPreviewServer();
  try {
    assert.equal(
      await lookupStatus(server.baseUrl, ["https://refused.example.com"]),
      "unavailable",
    );
  } finally {
    await server.close();
  }
});

test("e2e server→client: reachable site without icon maps to absent", async () => {
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

  const server = await startPreviewServer();
  try {
    assert.equal(
      await lookupStatus(server.baseUrl, ["https://no-icon.example.com"]),
      "absent",
    );
  } finally {
    await server.close();
  }
});

test("e2e server→client: found icon maps to found", async () => {
  const icon = new Uint8Array(80);
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

  const server = await startPreviewServer();
  try {
    assert.equal(
      await lookupStatus(server.baseUrl, ["https://has-icon.example.com"]),
      "found",
    );
  } finally {
    await server.close();
  }
});
