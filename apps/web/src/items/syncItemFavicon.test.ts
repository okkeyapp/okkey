import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/key-field-files", () => ({
  uploadEncryptedAttachment: vi.fn(),
  downloadKeyFieldFileAttachmentBytes: vi.fn(),
}));

vi.mock("../api/item-favicons", () => ({
  previewItemFavicon: vi.fn(),
}));

vi.mock("../lib/resizeFaviconImage", () => ({
  normalizeFaviconImageBytesToPng: vi.fn(async (bytes: Uint8Array) => bytes),
}));

import * as itemFaviconsApi from "../api/item-favicons";
import * as keyFieldFilesApi from "../api/key-field-files";
import {
  applyFaviconToItem,
  shouldAttachWebsiteFaviconInBackground,
  syncItemFaviconForPlaintext,
  websiteFaviconUrlsEqual,
} from "./syncItemFavicon";

function baseItem(overrides: Partial<ItemPlaintextV2> = {}): ItemPlaintextV2 {
  return {
    schemaVersion: 2,
    itemId: "1000000000000000001",
    vaultId: "1000000000000000002",
    title: "Example",
    categoryId: ITEM_CATEGORY_LOGIN,
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [],
    fields: [],
    ...overrides,
  };
}

function loginWithUrl(url: string, overrides: Partial<ItemPlaintextV2> = {}): ItemPlaintextV2 {
  return baseItem({
    fields: [
      {
        id: "f1",
        type: "url",
        sectionId: "websites",
        order: 0,
        label: "website URL",
        value: { kind: "url", url },
      },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyFaviconToItem", () => {
  it("sets faviconId and faviconSource", () => {
    const item = baseItem();
    const next = applyFaviconToItem(item, "1000000000000000003", "manual");
    expect(next.faviconId).toBe("1000000000000000003");
    expect(next.faviconSource).toBe("manual");
  });

  it("clears favicon fields when omitted", () => {
    const item = baseItem({ faviconId: "1000000000000000003", faviconSource: "manual" });
    const next = applyFaviconToItem(item, undefined, undefined);
    expect(next.faviconId).toBeUndefined();
    expect(next.faviconSource).toBeUndefined();
  });
});

describe("websiteFaviconUrlsEqual", () => {
  it("compares trimmed URL lists", () => {
    expect(websiteFaviconUrlsEqual(["https://a.example/"], ["https://a.example/"])).toBe(true);
    expect(websiteFaviconUrlsEqual(["https://a.example/"], ["https://b.example/"])).toBe(false);
  });
});

describe("syncItemFaviconForPlaintext", () => {
  it("uploads manual png and stores faviconId on the item", async () => {
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockResolvedValue({
      attachmentId: "1000000000000000009",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });

    const item = baseItem({ categoryId: "server" });
    const png = new Uint8Array([137, 80, 78, 71]);
    const vaultKey = new Uint8Array([1, 2, 3]);

    const synced = await syncItemFaviconForPlaintext("token", vaultKey, item, undefined, {
      faviconSource: "manual",
      manualFaviconPng: png,
    });

    expect(keyFieldFilesApi.uploadEncryptedAttachment).toHaveBeenCalledWith({
      accessToken: "token",
      vaultId: item.vaultId,
      itemId: item.itemId,
      vaultKey,
      plaintext: png,
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: png.byteLength,
      purpose: "item-favicon",
    });
    expect(synced.item.faviconId).toBe("1000000000000000009");
    expect(synced.item.faviconSource).toBe("manual");
    expect(synced.uploadedFavicon?.attachmentId).toBe("1000000000000000009");
  });

  it("propagates manual upload failures", async () => {
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockRejectedValue(new Error("upload failed"));

    await expect(
      syncItemFaviconForPlaintext("token", new Uint8Array([1]), baseItem(), undefined, {
        faviconSource: "manual",
        manualFaviconPng: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow("upload failed");
  });

  it("keeps previous manual favicon on edit when no new png is pending", async () => {
    const previous = baseItem({
      faviconId: "1000000000000000008",
      faviconSource: "manual",
    });
    const edited = baseItem({ title: "Renamed" });

    const synced = await syncItemFaviconForPlaintext("token", new Uint8Array([1]), edited, previous, {
      faviconSource: "manual",
    });

    expect(keyFieldFilesApi.uploadEncryptedAttachment).not.toHaveBeenCalled();
    expect(synced.item.faviconId).toBe("1000000000000000008");
    expect(synced.item.faviconSource).toBe("manual");
  });

  it("reuses template favicon id on new item when manual source and no new png", async () => {
    const item = baseItem({ categoryId: "server" });

    const synced = await syncItemFaviconForPlaintext("token", new Uint8Array([1]), item, undefined, {
      faviconSource: "manual",
      reuseFaviconId: "1000000000000000007",
    });

    expect(keyFieldFilesApi.uploadEncryptedAttachment).not.toHaveBeenCalled();
    expect(synced.item.faviconId).toBe("1000000000000000007");
    expect(synced.item.faviconSource).toBe("manual");
  });

  it("copies a reused favicon attachment when it belongs to another item", async () => {
    vi.mocked(keyFieldFilesApi.downloadKeyFieldFileAttachmentBytes).mockResolvedValue({
      plaintext: new Uint8Array([137, 80, 78, 71]),
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockResolvedValue({
      attachmentId: "1000000000000000010",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    const item = baseItem({ categoryId: "server" });
    const vaultKey = new Uint8Array([1, 2, 3]);

    const synced = await syncItemFaviconForPlaintext("token", vaultKey, item, undefined, {
      faviconSource: "manual",
      reuseFaviconId: "1000000000000000007",
      reuseFaviconItemId: "1000000000000000006",
    });

    expect(synced.item.faviconId).toBe("1000000000000000010");
    expect(synced.item.faviconSource).toBe("manual");
    expect(synced.uploadedFavicon?.attachmentId).toBe("1000000000000000010");
  });

  it("does not call /favicon/preview on save when website URLs are unchanged", async () => {
    const previous = loginWithUrl("https://example.com", {
      faviconId: "1000000000000000011",
      faviconSource: "website",
    });
    const edited = loginWithUrl("https://example.com", { title: "Renamed only" });

    const synced = await syncItemFaviconForPlaintext("token", new Uint8Array([1]), edited, previous);

    expect(itemFaviconsApi.previewItemFavicon).not.toHaveBeenCalled();
    expect(keyFieldFilesApi.uploadEncryptedAttachment).not.toHaveBeenCalled();
    expect(synced.item.faviconId).toBe("1000000000000000011");
    expect(synced.item.faviconSource).toBe("website");
  });

  it("uploads form preview bytes without calling /favicon/preview", async () => {
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockResolvedValue({
      attachmentId: "1000000000000000012",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    const item = loginWithUrl("https://example.com");
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);

    const synced = await syncItemFaviconForPlaintext("token", new Uint8Array([1]), item, undefined, {
      websiteFaviconPng: png,
    });

    expect(itemFaviconsApi.previewItemFavicon).not.toHaveBeenCalled();
    expect(synced.item.faviconId).toBe("1000000000000000012");
    expect(synced.item.faviconSource).toBe("website");
  });

  it("does not await network on form save when preview bytes are missing", async () => {
    const item = loginWithUrl("https://slow.example");

    const synced = await syncItemFaviconForPlaintext("token", new Uint8Array([1]), item);

    expect(itemFaviconsApi.previewItemFavicon).not.toHaveBeenCalled();
    expect(synced.item.faviconId).toBeUndefined();
    expect(shouldAttachWebsiteFaviconInBackground(synced.item)).toBe(true);
  });

  it("keeps previous icon when network lookup returns null and URLs are unchanged", async () => {
    vi.mocked(itemFaviconsApi.previewItemFavicon).mockResolvedValue(null);
    const previous = loginWithUrl("https://example.com", {
      faviconId: "1000000000000000013",
      faviconSource: "website",
    });
    const edited = loginWithUrl("https://example.com", { title: "x" });

    const synced = await syncItemFaviconForPlaintext(
      "token",
      new Uint8Array([1]),
      edited,
      previous,
      undefined,
      { allowNetworkFetch: true },
    );

    expect(synced.item.faviconId).toBe("1000000000000000013");
  });

  it("fetches on import when allowNetworkFetch is set", async () => {
    const previewBytes = new Uint8Array([1, 2, 3, 4]);
    vi.mocked(itemFaviconsApi.previewItemFavicon).mockResolvedValue({
      arrayBuffer: async () => previewBytes.buffer.slice(
        previewBytes.byteOffset,
        previewBytes.byteOffset + previewBytes.byteLength,
      ),
    } as Blob);
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockResolvedValue({
      attachmentId: "1000000000000000014",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    const item = loginWithUrl("https://example.com");

    const synced = await syncItemFaviconForPlaintext(
      "token",
      new Uint8Array([1]),
      item,
      undefined,
      undefined,
      { allowNetworkFetch: true },
    );

    expect(itemFaviconsApi.previewItemFavicon).toHaveBeenCalled();
    expect(synced.item.faviconId).toBe("1000000000000000014");
  });
});
