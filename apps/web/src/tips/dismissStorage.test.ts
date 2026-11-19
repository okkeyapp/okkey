import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readTipsBannerDismissed,
  tipsBannerDismissedStorageKey,
  writeTipsBannerDismissed,
} from "./dismissStorage";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("tips dismiss storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists dismiss per user id", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });

    expect(readTipsBannerDismissed("user-a")).toBe(false);
    writeTipsBannerDismissed("user-a", true);
    expect(readTipsBannerDismissed("user-a")).toBe(true);
    expect(storage.getItem(tipsBannerDismissedStorageKey("user-a"))).toBe("1");
    expect(readTipsBannerDismissed("user-b")).toBe(false);

    writeTipsBannerDismissed("user-a", false);
    expect(readTipsBannerDismissed("user-a")).toBe(false);
  });

  it("treats missing user id as not dismissed", () => {
    expect(readTipsBannerDismissed(null)).toBe(false);
    expect(readTipsBannerDismissed(undefined)).toBe(false);
  });
});
