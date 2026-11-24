import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  extensionMayRequestServerFavicon,
  fetchClientOriginFavicon,
  loadFaviconProviderMode,
  resetFaviconProviderModeCache,
} from "./faviconMode.ts";

describe("extension favicon mode", { concurrency: false }, () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    resetFaviconProviderModeCache();
    globalThis.fetch = originalFetch;
  });

  test("off mode does not request the icon endpoint or the website", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ provider: "off" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const mode = await loadFaviconProviderMode("http://icons.test");
    assert.equal(mode, "off");
    assert.equal(extensionMayRequestServerFavicon(mode), false);
    assert.deepEqual(requested, ["http://icons.test/favicon/config"]);
  });

  test("explicit direct may use the server preview", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ provider: "direct" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const mode = await loadFaviconProviderMode("http://icons.test");
    assert.equal(extensionMayRequestServerFavicon(mode), true);
  });

  test("client mode fetches the site origin and not the Okkey API", async () => {
    const requested: string[] = [];
    const png = new Uint8Array(32);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/favicon/config")) {
        return new Response(JSON.stringify({ provider: "client" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(png, { status: 200, headers: { "Content-Type": "image/png" } });
    }) as typeof fetch;

    const mode = await loadFaviconProviderMode("http://icons.test");
    assert.equal(mode, "client");
    assert.equal(extensionMayRequestServerFavicon(mode), false);
    const bytes = await fetchClientOriginFavicon(["https://www.example.com/login"]);
    assert.ok(bytes);
    assert.equal(requested.includes("https://example.com/favicon.ico"), true);
    assert.equal(requested.some((url) => url.includes("/favicon/preview")), false);
    assert.equal(requested.some((url) => url.includes("example.com") && url.includes("icons.test")), false);
  });
});
