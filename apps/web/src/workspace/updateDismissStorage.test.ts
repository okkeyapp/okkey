import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpdateCheckInfo } from "./useUpdateCheck";
import {
  UPDATE_DISMISS_STORAGE_KEY,
  availableUpdatesFingerprint,
  dismissAvailableUpdates,
  isUpdateNoticeDismissed,
  readDismissedUpdatesFingerprint,
} from "./updateDismissStorage";

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
      return map.has(key) ? map.get(key)! : null;
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

const base: UpdateCheckInfo = {
  deploymentMode: "self_hosted",
  feedConfigured: true,
  current: { okkey: "1.0.0", enterprise: null },
  available: [{ id: "okkey", from: "1.0.0", to: "1.0.1", notes: null }],
};

describe("updateDismissStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("builds a stable fingerprint sorted by id", () => {
    expect(
      availableUpdatesFingerprint([
        { id: "okkey-enterprise", from: "a", to: "b", notes: null },
        { id: "okkey", from: "1", to: "2", notes: null },
      ]),
    ).toBe("okkey-enterprise:b|okkey:2");
  });

  it("hides notice after dismiss until target version changes", () => {
    expect(isUpdateNoticeDismissed(base)).toBe(false);
    dismissAvailableUpdates(base);
    expect(readDismissedUpdatesFingerprint()).toBe("okkey:1.0.1");
    expect(window.localStorage.getItem(UPDATE_DISMISS_STORAGE_KEY)).toBe("okkey:1.0.1");
    expect(isUpdateNoticeDismissed(base)).toBe(true);

    const newer: UpdateCheckInfo = {
      ...base,
      available: [{ id: "okkey", from: "1.0.0", to: "1.0.2", notes: null }],
    };
    expect(isUpdateNoticeDismissed(newer)).toBe(false);
  });
});
