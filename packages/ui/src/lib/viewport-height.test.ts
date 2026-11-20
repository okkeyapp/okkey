import { describe, expect, it } from "vitest";

import {
  authShellCenteredCardClassName,
  authShellRootClassName,
  authShellScrollClassName,
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

  it("authShellRootClassName locks height so flex-1 scrollports can center with my-auto", () => {
    expect(authShellRootClassName).toContain("h-screen");
    expect(authShellRootClassName).toContain("h-dvh");
    expect(authShellRootClassName).toContain("min-h-screen");
    expect(authShellRootClassName).toContain("min-h-dvh");
    expect(authShellRootClassName).toContain("flex-col");
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

  it("auth shell centering uses my-auto on a flex-1 scrollport (not justify-center)", () => {
    expect(authShellCenteredCardClassName).toContain("my-auto");
    expect(authShellCenteredCardClassName).not.toContain("justify-center");
    expect(authShellScrollClassName).toContain("overflow-y-auto");
    expect(authShellScrollClassName).toContain("flex-1");
    expect(authShellScrollClassName).toContain("items-center");
    expect(authShellScrollClassName).not.toContain("justify-center");
  });
});
