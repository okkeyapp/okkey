import { describe, expect, it } from "vitest";

import {
  hAppShellClassName,
  minHAppClassName,
  safeAreaPaddingClassName,
} from "./viewport-height.js";

describe("viewport-height class tokens (TSK-308)", () => {
  it("minHAppClassName provides vh fallback then dvh", () => {
    expect(minHAppClassName).toContain("min-h-screen");
    expect(minHAppClassName).toContain("min-h-dvh");
    expect(minHAppClassName.indexOf("min-h-screen")).toBeLessThan(minHAppClassName.indexOf("min-h-dvh"));
  });

  it("hAppShellClassName uses svh so fixed shells never exceed the small viewport", () => {
    expect(hAppShellClassName).toContain("h-screen");
    expect(hAppShellClassName).toContain("h-svh");
    expect(hAppShellClassName.indexOf("h-screen")).toBeLessThan(hAppShellClassName.indexOf("h-svh"));
  });

  it("safeAreaPaddingClassName uses all four env(safe-area-inset-*) sides", () => {
    expect(safeAreaPaddingClassName).toContain("env(safe-area-inset-top)");
    expect(safeAreaPaddingClassName).toContain("env(safe-area-inset-right)");
    expect(safeAreaPaddingClassName).toContain("env(safe-area-inset-bottom)");
    expect(safeAreaPaddingClassName).toContain("env(safe-area-inset-left)");
  });
});
