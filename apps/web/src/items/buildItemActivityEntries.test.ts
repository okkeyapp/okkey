import { describe, expect, it } from "vitest";

import {
  buildItemActivityEntries,
  enrichItemActivityWithItemTimestamps,
} from "./buildItemActivityEntries";

describe("enrichItemActivityWithItemTimestamps", () => {
  it("adds updated from plaintext when wire history is create-only", () => {
    const enriched = enrichItemActivityWithItemTimestamps(
      [
        {
          id: "evt-1",
          actionKey: "created",
          atMs: 1_720_000_000_000,
          actorLabel: "Alex",
        },
      ],
      {
        itemId: "item-1",
        createdAtMs: 1_720_000_000_000,
        updatedAtMs: 1_725_000_000_000,
      },
      "Alex",
    );

    expect(enriched.map((entry) => entry.actionKey)).toEqual(["updated", "created"]);
    expect(enriched[0]?.atMs).toBe(1_725_000_000_000);
    expect(enriched[1]?.atMs).toBe(1_720_000_000_000);
  });

  it("does not invent updated when timestamps match", () => {
    const enriched = enrichItemActivityWithItemTimestamps(
      [
        {
          id: "evt-1",
          actionKey: "created",
          atMs: 1_720_000_000_000,
          actorLabel: "Alex",
        },
      ],
      {
        itemId: "item-1",
        createdAtMs: 1_720_000_000_000,
        updatedAtMs: 1_720_000_000_000,
      },
      "Alex",
    );

    expect(enriched).toHaveLength(1);
    expect(enriched[0]?.actionKey).toBe("created");
  });

  it("keeps real post-create wire activity without duplicating updated", () => {
    const enriched = enrichItemActivityWithItemTimestamps(
      [
        {
          id: "evt-2",
          actionKey: "updated",
          atMs: 1_726_000_000_000,
          actorLabel: "Alex",
        },
        {
          id: "evt-1",
          actionKey: "created",
          atMs: 1_720_000_000_000,
          actorLabel: "Alex",
        },
      ],
      {
        itemId: "item-1",
        createdAtMs: 1_720_000_000_000,
        updatedAtMs: 1_726_000_000_000,
      },
      "Alex",
    );

    expect(enriched.filter((entry) => entry.actionKey === "updated")).toHaveLength(1);
    expect(enriched[0]?.atMs).toBe(1_726_000_000_000);
  });
});

describe("buildItemActivityEntries", () => {
  it("includes updated when later than created", () => {
    const entries = buildItemActivityEntries({
      itemId: "item-1",
      createdAtMs: 10,
      updatedAtMs: 20,
      actorLabel: "Alex",
    });
    expect(entries.map((entry) => entry.actionKey)).toEqual(["updated", "created"]);
  });
});
