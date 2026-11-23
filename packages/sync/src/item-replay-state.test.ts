import { describe, expect, it } from "vitest";

import type { ItemPlaintextV2, SyncEventWireDto } from "@okkey/types";

import { applyItemPlaintextToReplayMap } from "./item-replay-state.js";

function item(partial: Partial<ItemPlaintextV2> & Pick<ItemPlaintextV2, "itemId">): ItemPlaintextV2 {
  return {
    schemaVersion: 2,
    vaultId: "1000000000000000001",
    title: "Login",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 2,
    sections: [],
    fields: [],
    ...partial,
  };
}

describe("applyItemPlaintextToReplayMap ITEM_PURGE", () => {
  it("removes the item from materialized state", () => {
    const items = new Map<string, ItemPlaintextV2>([
      ["1000000000000000002", item({ itemId: "1000000000000000002", deleted: true })],
    ]);
    const event: Pick<SyncEventWireDto, "eventType" | "createdAt" | "itemSoftDeleted"> = {
      eventType: "ITEM_PURGE",
      createdAt: "2026-01-01T00:00:00.000Z",
      itemSoftDeleted: false,
    };

    applyItemPlaintextToReplayMap(items, item({ itemId: "1000000000000000002", deleted: true }), event);

    expect(items.has("1000000000000000002")).toBe(false);
  });
});
