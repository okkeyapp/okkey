/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import {
  applyPageBackgroundGradients,
  pageBackgroundGradient,
  PAGE_BACKGROUND_GRADIENT_DARK,
  PAGE_BACKGROUND_GRADIENT_LIGHT,
} from "./page-background-gradients.js";

describe("pageBackgroundGradient", () => {
  it("keeps the classic blue→warm wash for a2 light", () => {
    expect(pageBackgroundGradient("light", "a2")).toBe(PAGE_BACKGROUND_GRADIENT_LIGHT);
    expect(PAGE_BACKGROUND_GRADIENT_LIGHT).toContain("rgb(234, 240, 250)");
    expect(PAGE_BACKGROUND_GRADIENT_LIGHT).toContain("rgb(255, 248, 239)");
  });

  it("uses solid secondary for all dark accents", () => {
    for (const id of ["a1", "a2", "a5", "a7"] as const) {
      const dark = pageBackgroundGradient("dark", id);
      expect(dark).toBe(PAGE_BACKGROUND_GRADIENT_DARK);
      expect(dark).toContain("var(--secondary)");
      expect(dark).not.toContain("136.85deg");
    }
  });

  it("uses solid secondary for monochrome a1 light", () => {
    const mono = pageBackgroundGradient("light", "a1");
    expect(mono).toContain("var(--secondary)");
    expect(mono).not.toContain("136.85deg");
  });

  it("uses monochrome fill when accent tint is off", () => {
    const withTint = pageBackgroundGradient("light", "a5", true);
    const withoutTint = pageBackgroundGradient("light", "a5", false);
    expect(withTint).toContain("136.85deg");
    expect(withoutTint).toContain("var(--secondary)");
    expect(withoutTint).toBe(pageBackgroundGradient("light", "a1"));
  });

  it("returns distinct chromatic washes for other light accents", () => {
    const blue = pageBackgroundGradient("light", "a2");
    const orange = pageBackgroundGradient("light", "a5");
    const purple = pageBackgroundGradient("light", "a7");
    expect(orange).not.toBe(blue);
    expect(purple).not.toBe(blue);
    expect(orange.startsWith("linear-gradient")).toBe(true);
  });
});

describe("applyPageBackgroundGradients", () => {
  it("writes CSS vars for the active accent and tint state", () => {
    const root = document.documentElement;
    applyPageBackgroundGradients(root, "a5", true);
    expect(root.style.getPropertyValue("--page-gradient-light")).toContain("136.85deg");
    expect(root.style.getPropertyValue("--page-gradient-dark")).toContain("var(--secondary)");

    applyPageBackgroundGradients(root, "a5", false);
    expect(root.style.getPropertyValue("--page-gradient-light")).toContain("var(--secondary)");
    expect(root.style.getPropertyValue("--page-gradient-dark")).toContain("var(--secondary)");

    applyPageBackgroundGradients(root, "a1", true);
    expect(root.style.getPropertyValue("--page-gradient-light")).toContain("var(--secondary)");
  });
});
