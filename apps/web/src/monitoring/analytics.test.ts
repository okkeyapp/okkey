import { describe, expect, it } from "vitest";
import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";

import { computeMonitoringAnalytics } from "./analytics";

function item(partial: Partial<ItemPlaintextV2> & Pick<ItemPlaintextV2, "itemId" | "fields">): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    vaultId: "vault-1",
    title: partial.title ?? "Item",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: partial.updatedAtMs ?? Date.now(),
    sections: [],
    ...partial,
  };
}

describe("computeMonitoringAnalytics", () => {
  it("buckets strength and detects reuse", () => {
    const report = computeMonitoringAnalytics([
      item({
        itemId: "a",
        fields: [{ id: "f1", type: "password", sectionId: "s", order: 0, value: { kind: "password", password: "password" } }],
      }),
      item({
        itemId: "b",
        fields: [{ id: "f2", type: "password", sectionId: "s", order: 0, value: { kind: "password", password: "password" } }],
      }),
      item({
        itemId: "c",
        fields: [
          {
            id: "f3",
            type: "password",
            sectionId: "s",
            order: 0,
            value: { kind: "password", password: "Correct-Horse-Battery-Staple-99!" },
          },
        ],
      }),
    ]);

    expect(report.passwordCount).toBe(3);
    expect(report.reusedItemIds.sort()).toEqual(["a", "b"]);
    expect(report.weakItemIds).toContain("a");
    expect(report.strengthCounts.strong + report.strengthCounts.medium + report.strengthCounts.weak).toBe(3);
    expect(report.score).toBeLessThan(100);
  });

  it("marks stale passwords by age", () => {
    const now = Date.UTC(2026, 0, 1);
    const report = computeMonitoringAnalytics(
      [
        item({
          itemId: "old",
          updatedAtMs: now - 400 * 24 * 60 * 60 * 1000,
          fields: [{ id: "f1", type: "password", sectionId: "s", order: 0, value: { kind: "password", password: "UniqueStrongPass99!" } }],
        }),
      ],
      { nowMs: now },
    );
    expect(report.staleItemIds).toEqual(["old"]);
  });
});
