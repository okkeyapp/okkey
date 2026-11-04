import { afterEach, describe, expect, it, vi } from "vitest";

import { FaviconPreviewDisabledError, previewItemFavicon } from "./item-favicons";
import { resetFaviconProviderModeCache } from "../items/faviconMode";

describe("previewItemFavicon privacy default", () => {
  afterEach(() => {
    resetFaviconProviderModeCache();
    vi.unstubAllGlobals();
    delete window.__OKKEY_RUNTIME__;
  });

  it("does not call /favicon/preview when the server mode is off", async () => {
    const urls: string[] = [];
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: "http://icons.test" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/favicon/config")) {
          return new Response(JSON.stringify({ provider: "off" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("unexpected", { status: 500 });
      }),
    );

    await expect(previewItemFavicon("token", ["https://secret.example/login"])).rejects.toBeInstanceOf(
      FaviconPreviewDisabledError,
    );
    expect(urls.some((url) => url.includes("/favicon/preview"))).toBe(false);
    expect(urls.some((url) => url.includes("secret.example"))).toBe(false);
  });

  it("calls /favicon/preview only after an explicit direct mode", async () => {
    const urls: string[] = [];
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: "http://icons.test" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/favicon/config")) {
          return new Response(JSON.stringify({ provider: "direct" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as { urls: string[] };
        expect(body.urls).toEqual(["https://example.com"]);
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }),
    );

    const blob = await previewItemFavicon("token", ["https://example.com"]);
    expect(blob).not.toBeNull();
    expect(urls.some((url) => url.endsWith("/favicon/preview"))).toBe(true);
  });

  it("does not call /favicon/preview in client mode", async () => {
    const urls: string[] = [];
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: "http://icons.test" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ provider: "client" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(previewItemFavicon("token", ["https://example.com"])).rejects.toBeInstanceOf(
      FaviconPreviewDisabledError,
    );
    expect(urls).toEqual(["http://icons.test/favicon/config"]);
  });
});
