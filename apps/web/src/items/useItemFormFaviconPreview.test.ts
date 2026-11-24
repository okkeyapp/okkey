import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./faviconMode", () => ({
  useFaviconProviderMode: () => "direct",
}));

vi.mock("../api/item-favicons", () => ({
  previewItemFavicon: vi.fn(),
}));

// This case checks that a settled preview is not refetched. Rasterizing the
// stub bytes is covered by the favicon image tests.
vi.mock("../lib/resizeFaviconImage", () => ({
  normalizeFaviconImageBytesToPng: async (bytes: Uint8Array) => bytes,
}));

import { previewItemFavicon } from "../api/item-favicons";
import {
  useItemFormFaviconPreview,
  websiteFaviconPngForCurrentUrls,
  websiteUrlsLookupKey,
} from "./useItemFormFaviconPreview";

const previewItemFaviconMock = vi.mocked(previewItemFavicon);

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

describe("useItemFormFaviconPreview", () => {
  beforeEach(() => {
    previewItemFaviconMock.mockReset();
    const png = Uint8Array.from([137, 80, 78, 71]);
    previewItemFaviconMock.mockResolvedValue({
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    } as Blob);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:favicon-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not request or reset the preview when re-rendered with a new array of the same URLs", async () => {
    const { result, rerender } = renderHook(
      (props: { urls: readonly string[] }) =>
        useItemFormFaviconPreview({
          accessToken: "token",
          categoryId: ITEM_CATEGORY_LOGIN,
          urls: props.urls,
        }),
      { initialProps: { urls: ["https://acme.example/"] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(previewItemFaviconMock).toHaveBeenCalledTimes(1);
    const previewSrc = result.current.previewImageSrc;
    expect(previewSrc).toBe("blob:favicon-preview");

    for (let index = 0; index < 10; index += 1) {
      rerender({ urls: ["https://acme.example/"] });
      expect(result.current.previewImageSrc).toBe(previewSrc);
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(previewItemFaviconMock).toHaveBeenCalledTimes(1);
    expect(result.current.previewImageSrc).toBe(previewSrc);
  });

  it("skips the initial request when edit mode already has a stored icon for these URLs", async () => {
    const urls = ["https://acme.example/"];
    const { result, rerender } = renderHook(
      (props: { urls: readonly string[] }) =>
        useItemFormFaviconPreview({
          accessToken: "token",
          categoryId: ITEM_CATEGORY_LOGIN,
          urls: props.urls,
          skipFetchForUrlsKey: websiteUrlsLookupKey(["https://acme.example/"]),
        }),
      { initialProps: { urls } },
    );

    for (let index = 0; index < 10; index += 1) {
      rerender({ urls: ["https://acme.example/"] });
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(previewItemFaviconMock).not.toHaveBeenCalled();
    expect(result.current.previewImageSrc).toBeUndefined();
  });
});
