import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  bytesEqual,
  hostsFromUrls,
  looksLikeImageBytes,
  parseFaviconProvider,
  fetchRemoteFaviconBytes,
  fetchRemoteFaviconBytesFromUrls,
} from "../src/favicon/fetch-remote.ts";

describe("hostsFromUrls", () => {
  test("returns hosts in URL list order", () => {
    assert.deepEqual(
      hostsFromUrls(["https://gog.ru", "https://google.com"]),
      ["gog.ru", "google.com"],
    );
  });

  test("skips unsuitable hosts but keeps order", () => {
    assert.deepEqual(
      hostsFromUrls(["http://localhost:3000", "https://google.com", "192.168.0.1"]),
      ["google.com"],
    );
  });
});

describe("bytesEqual", () => {
  test("compares byte arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    assert.equal(bytesEqual(a, a), true);
    assert.equal(bytesEqual(a, new Uint8Array([1, 2, 3])), true);
    assert.equal(bytesEqual(a, new Uint8Array([1, 2])), false);
  });
});

describe("parseFaviconProvider", () => {
  test("defaults to direct", () => {
    assert.equal(parseFaviconProvider(undefined), "direct");
    assert.equal(parseFaviconProvider(""), "direct");
    assert.equal(parseFaviconProvider("DIRECT"), "direct");
  });

  test("accepts google and off", () => {
    assert.equal(parseFaviconProvider("google"), "google");
    assert.equal(parseFaviconProvider("off"), "off");
  });

  test("rejects unknown values", () => {
    assert.throws(() => parseFaviconProvider("yandex"), /FAVICON_PROVIDER/);
  });
});

describe("looksLikeImageBytes", () => {
  test("detects PNG magic", () => {
    const png = new Uint8Array(32);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    assert.equal(looksLikeImageBytes(png), true);
  });

  test("rejects HTML and tiny payloads", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html></html>");
    assert.equal(looksLikeImageBytes(html), false);
    assert.equal(looksLikeImageBytes(new Uint8Array([0x89, 0x50])), false);
  });
});

describe("fetchRemoteFaviconBytes provider=off", () => {
  test("returns null without network", async () => {
    assert.equal(await fetchRemoteFaviconBytes("example.com", { provider: "off" }), null);
    assert.equal(
      await fetchRemoteFaviconBytesFromUrls(["https://example.com"], { provider: "off" }),
      null,
    );
  });
});

describe("fetchRemoteFaviconBytes provider=direct", () => {
  test("direct provider requests the site origin", async () => {
    const requested: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requested.push(url);
      return new Response("not-an-image", { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    try {
      await fetchRemoteFaviconBytes("example.com", { provider: "direct" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.ok(requested.length > 0);
    for (const url of requested) {
      assert.match(url, /^https:\/\/example\.com\//);
      assert.doesNotMatch(url, /google\.com/i);
    }
  });
});
