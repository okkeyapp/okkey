import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildCapsulePageItems,
  capsulePageRowCount,
  loadVisibleCapsuleColumns,
  normalizeVisibleCapsuleColumns,
  saveVisibleCapsuleColumns,
} from "./capsuleTableColumns";

describe("normalizeVisibleCapsuleColumns", () => {
  it("always keeps the name column first and preserves canonical order", () => {
    expect(normalizeVisibleCapsuleColumns(["password", "views"])).toEqual([
      "name",
      "views",
      "password",
    ]);
  });
});

describe("capsule column persistence", () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    memory.clear();
  });

  it("loads default columns without updated", () => {
    expect(loadVisibleCapsuleColumns()).toEqual([
      "name",
      "type",
      "created",
      "active",
      "views",
      "password",
    ]);
  });

  it("saves a subset and restores name even if omitted", () => {
    saveVisibleCapsuleColumns(["type", "created"]);
    expect(loadVisibleCapsuleColumns()).toEqual(["name", "type", "created"]);
  });
});

describe("capsulePageRowCount", () => {
  it("uses the initial skeleton size when total is unknown", () => {
    expect(capsulePageRowCount(1, 0, 30)).toBe(5);
  });

  it("returns remaining rows on the last page", () => {
    expect(capsulePageRowCount(3, 65, 30)).toBe(5);
  });

  it("never exceeds page size on a full page", () => {
    expect(capsulePageRowCount(2, 65, 30)).toBe(30);
  });
});

describe("buildCapsulePageItems", () => {
  it("returns all pages when there are at most 7", () => {
    expect(buildCapsulePageItems(1, 4)).toEqual([1, 2, 3, 4]);
    expect(buildCapsulePageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows a start window with ellipsis when many pages", () => {
    expect(buildCapsulePageItems(1, 9)).toEqual([1, 2, 3, 4, "ellipsis", 9]);
    expect(buildCapsulePageItems(1, 100)).toEqual([1, 2, 3, 4, "ellipsis", 100]);
  });

  it("keeps a window around the current page with ellipsis gaps", () => {
    expect(buildCapsulePageItems(5, 9)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 9]);
    expect(buildCapsulePageItems(50, 100)).toEqual([1, "ellipsis", 49, 50, 51, "ellipsis", 100]);
  });

  it("shows an end window with ellipsis when near the last page", () => {
    expect(buildCapsulePageItems(9, 9)).toEqual([1, "ellipsis", 6, 7, 8, 9]);
  });
});
