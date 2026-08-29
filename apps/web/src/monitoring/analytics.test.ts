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
        fields: [{ id: "password", type: "password", sectionId: "credentials", order: 0, value: { kind: "password", password: "password" } }],
      }),
      item({
        itemId: "b",
        fields: [{ id: "password", type: "password", sectionId: "credentials", order: 0, value: { kind: "password", password: "password" } }],
      }),
      item({
        itemId: "c",
        fields: [
          {
            id: "password",
            type: "password",
            sectionId: "credentials",
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
          fields: [{ id: "password", type: "password", sectionId: "credentials", order: 0, value: { kind: "password", password: "UniqueStrongPass99!" } }],
        }),
      ],
      { nowMs: now },
    );
    expect(report.staleItemIds).toEqual(["old"]);
  });

  it("detects 2FA gap when catalog supports totp but item has no totp field", () => {
    const report = computeMonitoringAnalytics(
      [
        item({
          itemId: "gh-login",
          fields: [
            {
              id: "url",
              type: "url",
              sectionId: "websites",
              order: 0,
              value: { kind: "url", url: "https://github.com/login" },
            },
            {
              id: "password",
              type: "password",
              sectionId: "credentials",
              order: 1,
              value: { kind: "password", password: "UniqueStrongPassphrase-2026!" },
            },
          ],
        }),
        item({
          itemId: "gh-with-totp",
          fields: [
            {
              id: "url",
              type: "url",
              sectionId: "websites",
              order: 0,
              value: { kind: "url", url: "https://github.com" },
            },
            {
              id: "password",
              type: "password",
              sectionId: "credentials",
              order: 1,
              value: { kind: "password", password: "AnotherUniquePassphrase-2026!" },
            },
            {
              id: "totp",
              type: "totp",
              sectionId: "credentials",
              order: 2,
              value: { kind: "totp", secretBase32: "JBSWY3DPEHPK3PXP" },
            },
          ],
        }),
      ],
      {
        catalogEntries: {
          "github.com": { supports2FA: true, supportsPasskeys: true, sources: ["test"] },
        },
      },
    );
    expect(report.twoFactorGapItemIds).toEqual(["gh-login"]);
  });

  it("ignores credit card PIN for strength and weak counts", () => {
    const report = computeMonitoringAnalytics([
      item({
        itemId: "card-1",
        categoryId: "credit_card",
        fields: [
          {
            id: "card-pin",
            type: "pin",
            sectionId: "credit-card",
            order: 2,
            value: {
              kind: "unknown",
              declaredType: "secret",
              raw: { secretKind: "password", value: "1234" },
            },
          },
        ],
      }),
    ]);
    expect(report.passwordCount).toBe(0);
    expect(report.weakItemIds).toEqual([]);
    expect(report.analyzedItemIds).toEqual([]);
  });
});
