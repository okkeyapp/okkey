import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { describe, expect, it, vi } from "vitest";

import * as itemFaviconsApi from "../api/item-favicons";
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
    const upsertPng = vi.spyOn(itemFaviconsApi, "upsertItemFaviconPng").mockResolvedValue({
      faviconId: "1000000000000000009",
    });

    const item = baseItem({ categoryId: "server" });
    const png = new Uint8Array([137, 80, 78, 71]);

    const synced = await syncItemFaviconForPlaintext("token", item, undefined, {
      faviconSource: "manual",
      manualFaviconPng: png,
    });

    expect(upsertPng).toHaveBeenCalledWith("token", item.vaultId, item.itemId, png);
    expect(synced.faviconId).toBe("1000000000000000009");
    expect(synced.faviconSource).toBe("manual");
  });

  it("throws when manual upload returns no faviconId", async () => {
    vi.spyOn(itemFaviconsApi, "upsertItemFaviconPng").mockResolvedValue({ faviconId: null });

    await expect(
      syncItemFaviconForPlaintext("token", baseItem(), undefined, {
        faviconSource: "manual",
        manualFaviconPng: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow("FAVICON_MANUAL_UPLOAD_FAILED");
  });

  it("keeps previous manual favicon on edit when no new png is pending", async () => {
    const upsertPng = vi.spyOn(itemFaviconsApi, "upsertItemFaviconPng");
    const previous = baseItem({
      faviconId: "1000000000000000008",
      faviconSource: "manual",
    });
    const edited = baseItem({ title: "Renamed" });

    const synced = await syncItemFaviconForPlaintext("token", edited, previous, {
      faviconSource: "manual",
    });

    expect(upsertPng).not.toHaveBeenCalled();
    expect(synced.faviconId).toBe("1000000000000000008");
    expect(synced.faviconSource).toBe("manual");
  });

  it("reuses template favicon id on new item when manual source and no new png", async () => {
    const upsertPng = vi.spyOn(itemFaviconsApi, "upsertItemFaviconPng");
    const item = baseItem({ categoryId: "server" });

    const synced = await syncItemFaviconForPlaintext("token", item, undefined, {
      faviconSource: "manual",
      reuseFaviconId: "1000000000000000007",
    });

    expect(upsertPng).not.toHaveBeenCalled();
    expect(synced.faviconId).toBe("1000000000000000007");
    expect(synced.faviconSource).toBe("manual");
  });
});
