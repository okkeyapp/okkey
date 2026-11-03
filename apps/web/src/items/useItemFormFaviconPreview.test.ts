import { describe, expect, it } from "vitest";

import { websiteFaviconPngForCurrentUrls, websiteUrlsLookupKey } from "./useItemFormFaviconPreview";

describe("websiteUrlsLookupKey", () => {
  it("is stable for equivalent URL lists", () => {
    expect(websiteUrlsLookupKey([" https://a.example ", "https://b.example"])).toBe(
      websiteUrlsLookupKey(["https://a.example", "https://b.example"]),
    );
  });

  it("changes when the URL list changes", () => {
    expect(websiteUrlsLookupKey(["https://a.example"])).not.toBe(
      websiteUrlsLookupKey(["https://a.example/path"]),
    );
  });
});

describe("websiteFaviconPngForCurrentUrls", () => {
  const acmeKey = websiteUrlsLookupKey(["https://acme.example/"]);
  const slowKey = websiteUrlsLookupKey(["https://slow.example/"]);
  const acmeBytes = new Uint8Array([1, 2, 3]);

  it("returns preview bytes only when they match the current URL key", () => {
    expect(
      websiteFaviconPngForCurrentUrls({
        currentUrlsKey: acmeKey,
        previewUrlsKey: acmeKey,
        previewPngBytes: acmeBytes,
      }),
    ).toBe(acmeBytes);
  });

  it("drops stale preview bytes after the website URL changes (Save-before-preview race)", () => {
    expect(
      websiteFaviconPngForCurrentUrls({
        currentUrlsKey: slowKey,
        previewUrlsKey: acmeKey,
        previewPngBytes: acmeBytes,
      }),
    ).toBeNull();
  });

  it("drops bytes while a new preview is loading (cleared previewUrlsKey)", () => {
    expect(
      websiteFaviconPngForCurrentUrls({
        currentUrlsKey: slowKey,
        previewUrlsKey: null,
        previewPngBytes: acmeBytes,
      }),
    ).toBeNull();
  });

  it("returns null when there are no preview bytes", () => {
    expect(
      websiteFaviconPngForCurrentUrls({
        currentUrlsKey: acmeKey,
        previewUrlsKey: acmeKey,
        previewPngBytes: null,
      }),
    ).toBeNull();
  });
});
