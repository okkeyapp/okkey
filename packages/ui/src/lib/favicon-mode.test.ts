import { describe, expect, it } from "vitest";

import {
  clientSideFaviconUrl,
  clientSideFaviconUrlFromUrls,
  faviconProviderUsesServerPreview,
  parseFaviconProviderMode,
  resolveWebsiteIconDisplay,
} from "./favicon-mode.js";

describe("parseFaviconProviderMode", () => {
  it("fails closed to off", () => {
    expect(parseFaviconProviderMode(undefined)).toBe("off");
    expect(parseFaviconProviderMode("")).toBe("off");
    expect(parseFaviconProviderMode("yandex")).toBe("off");
  });

  it("keeps explicit modes", () => {
    expect(parseFaviconProviderMode("direct")).toBe("direct");
    expect(parseFaviconProviderMode(" DIRECT ")).toBe("direct");
    expect(parseFaviconProviderMode("google")).toBe("google");
    expect(parseFaviconProviderMode("client")).toBe("client");
    expect(parseFaviconProviderMode("off")).toBe("off");
  });
});

describe("resolveWebsiteIconDisplay", () => {
  it("uses a monogram when icons are off and does not build a remote URL", () => {
    expect(resolveWebsiteIconDisplay("off", ["https://secret.example/login"])).toEqual({
      kind: "monogram",
    });
    expect(faviconProviderUsesServerPreview("off")).toBe(false);
    expect(faviconProviderUsesServerPreview("client")).toBe(false);
  });

  it("asks the server only for an explicit direct or google mode", () => {
    expect(resolveWebsiteIconDisplay("direct", ["https://secret.example"])).toEqual({ kind: "server" });
    expect(resolveWebsiteIconDisplay("google", ["https://secret.example"])).toEqual({ kind: "server" });
    expect(faviconProviderUsesServerPreview("direct")).toBe(true);
  });

  it("points client mode at the site origin, not the Okkey API", () => {
    const display = resolveWebsiteIconDisplay("client", [
      "http://localhost/admin",
      "https://www.example.com/login",
    ]);
    expect(display).toEqual({ kind: "client", src: "https://example.com/favicon.ico" });
    if (display.kind === "client") {
      expect(display.src.includes("okkey")).toBe(false);
      expect(display.src.includes("/favicon/preview")).toBe(false);
    }
  });

  it("falls back to a monogram when client mode has no public host", () => {
    expect(resolveWebsiteIconDisplay("client", ["http://127.0.0.1/secret"])).toEqual({
      kind: "monogram",
    });
    expect(clientSideFaviconUrl("https://localhost/a")).toBeNull();
    expect(clientSideFaviconUrlFromUrls([])).toBeNull();
  });
});
