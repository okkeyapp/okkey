import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildCapsulePageItems,
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

  it("loads every column by default", () => {
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

describe("buildCapsulePageItems", () => {
  it("returns all pages when there are at most 7", () => {
    expect(buildCapsulePageItems(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it("shows first and last triplets on the first page", () => {
    expect(buildCapsulePageItems(1, 9)).toEqual([1, 2, 3, "ellipsis", 7, 8, 9]);
  });

  it("keeps a window around the current page", () => {
    expect(buildCapsulePageItems(5, 9)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 9]);
  });
});
