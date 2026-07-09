import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as keyFieldFilesApi from "../api/key-field-files";
import { applyFaviconToItem, syncItemFaviconForPlaintext } from "./syncItemFavicon";

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

beforeEach(() => {
  vi.restoreAllMocks();
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

describe("syncItemFaviconForPlaintext", () => {
  it("uploads manual png and stores faviconId on the item", async () => {
    const upload = vi.spyOn(keyFieldFilesApi, "uploadEncryptedAttachment").mockResolvedValue({
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

    expect(upload).toHaveBeenCalledWith({
      accessToken: "token",
      vaultId: item.vaultId,
      itemId: item.itemId,
      vaultKey,
      plaintext: png,
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: png.byteLength,
    });
    expect(synced.item.faviconId).toBe("1000000000000000009");
    expect(synced.item.faviconSource).toBe("manual");
    expect(synced.uploadedFavicon?.attachmentId).toBe("1000000000000000009");
  });

  it("propagates manual upload failures", async () => {
    vi.spyOn(keyFieldFilesApi, "uploadEncryptedAttachment").mockRejectedValue(new Error("upload failed"));

    await expect(
      syncItemFaviconForPlaintext("token", new Uint8Array([1]), baseItem(), undefined, {
        faviconSource: "manual",
        manualFaviconPng: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow("upload failed");
  });

  it("keeps previous manual favicon on edit when no new png is pending", async () => {
    const upload = vi.spyOn(keyFieldFilesApi, "uploadEncryptedAttachment");
    const previous = baseItem({
      faviconId: "1000000000000000008",
      faviconSource: "manual",
    });
    const edited = baseItem({ title: "Renamed" });

    const synced = await syncItemFaviconForPlaintext("token", new Uint8Array([1]), edited, previous, {
      faviconSource: "manual",
    });

    expect(upload).not.toHaveBeenCalled();
    expect(synced.item.faviconId).toBe("1000000000000000008");
    expect(synced.item.faviconSource).toBe("manual");
  });

  it("reuses template favicon id on new item when manual source and no new png", async () => {
    const upload = vi.spyOn(keyFieldFilesApi, "uploadEncryptedAttachment");
    const item = baseItem({ categoryId: "server" });

    const synced = await syncItemFaviconForPlaintext("token", new Uint8Array([1]), item, undefined, {
      faviconSource: "manual",
      reuseFaviconId: "1000000000000000007",
    });

    expect(upload).not.toHaveBeenCalled();
    expect(synced.item.faviconId).toBe("1000000000000000007");
    expect(synced.item.faviconSource).toBe("manual");
  });

  it("copies a reused favicon attachment when it belongs to another item", async () => {
    vi.spyOn(keyFieldFilesApi, "downloadKeyFieldFileAttachmentBytes").mockResolvedValue({
      plaintext: new Uint8Array([137, 80, 78, 71]),
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 4,
    });
    vi.spyOn(keyFieldFilesApi, "uploadEncryptedAttachment").mockResolvedValue({
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
});
