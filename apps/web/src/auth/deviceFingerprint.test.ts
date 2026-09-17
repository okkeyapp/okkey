import { describe, expect, it, vi } from "vitest";

vi.mock("./browserEnvironment", async () => {
  const actual = await vi.importActual<typeof import("./browserEnvironment")>("./browserEnvironment");
  return actual;
});

import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";

describe("getOrCreateDeviceFingerprint", () => {
  it("builds a stable structured id from the user agent (no IP)", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });

    const first = getOrCreateDeviceFingerprint();
    const second = getOrCreateDeviceFingerprint();
    expect(first).toBe("web_app-chrome-macos-10.15.7");
    expect(second).toBe(first);
    expect(first.includes(".")).toBe(true);
    expect(first.startsWith("web_app-")).toBe(true);
  });
});
