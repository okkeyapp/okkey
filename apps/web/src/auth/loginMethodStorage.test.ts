import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingLoginDiscover,
  readLastLoginMethodHint,
  readPendingLoginDiscover,
  writeLastLoginMethodHint,
  writePendingLoginDiscover,
} from "./loginMethodStorage";

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

describe("loginMethodStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  it("round-trips last login hint", () => {
    writeLastLoginMethodHint({ email: "Alex@Okkey.app", primary: "passkey" });
    expect(readLastLoginMethodHint()).toEqual({
      email: "alex@okkey.app",
      primary: "passkey",
    });
  });

  it("stores pending discover and always includes email", () => {
    writePendingLoginDiscover({
      email: "a@okkey.app",
      primary: "hardware_key",
      methods: ["hardware_key"],
    });
    expect(readPendingLoginDiscover()).toEqual({
      email: "a@okkey.app",
      primary: "hardware_key",
      methods: ["email", "hardware_key"],
    });
    clearPendingLoginDiscover();
    expect(readPendingLoginDiscover()).toBeNull();
  });
});
