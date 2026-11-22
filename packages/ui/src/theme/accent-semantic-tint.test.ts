/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import {
  ACCENT_HSL,
  applyAccentRing,
  applySemanticAccentTint,
  mixHslPreserveLightness,
} from "./accent-semantic-tint.js";

function parseTriplet(raw: string): { h: number; s: number; l: number } {
  const match = raw.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) {
    throw new Error(`bad hsl triplet: ${raw}`);
  }
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

describe("mixHslPreserveLightness", () => {
  it("keeps base lightness and uses accent hue (not a mid-lerp hue)", () => {
    const base = [240, 4.8, 95.9] as const;
    const orange = ACCENT_HSL.light.a5;
    const mixed = parseTriplet(mixHslPreserveLightness(base, orange, 0.42));

    expect(mixed.h).toBeCloseTo(orange[0], 1);
    expect(mixed.l).toBeCloseTo(base[2], 1);
    expect(mixed.s).toBeGreaterThan(35);
    expect(mixed.s).toBeLessThan(55);
  });

  it("barely shifts saturation for monochrome accent a1", () => {
    const base = [240, 4.8, 95.9] as const;
    const mono = ACCENT_HSL.light.a1;
    const mixed = parseTriplet(mixHslPreserveLightness(base, mono, 0.42));

    expect(mixed.h).toBeCloseTo(mono[0], 1);
    expect(mixed.s).toBeLessThan(6);
    expect(mixed.l).toBeCloseTo(base[2], 1);
  });

  it("keeps secondary text and borders mostly gray with only a light accent mix", () => {
    const textBase = [240, 3.8, 46.1] as const;
    const borderBase = [240, 5.9, 90] as const;
    const orange = ACCENT_HSL.light.a5;
    const text = parseTriplet(mixHslPreserveLightness(textBase, orange, 0.1));
    const border = parseTriplet(mixHslPreserveLightness(borderBase, orange, 0.1));

    expect(text.h).toBeCloseTo(orange[0], 1);
    expect(text.l).toBeCloseTo(textBase[2], 1);
    expect(text.s).toBeGreaterThan(textBase[1]);
    expect(text.s).toBeLessThan(16);

    expect(border.h).toBeCloseTo(orange[0], 1);
    expect(border.l).toBeCloseTo(borderBase[2], 1);
    expect(border.s).toBeLessThan(16);
  });
});

describe("applySemanticAccentTint", () => {
  it("writes accent-hued secondary when enabled", () => {
    const root = document.documentElement;
    applySemanticAccentTint(root, "light", "a5", true);

    expect(root.dataset.accentTint).toBe("on");
    const secondary = parseTriplet(root.style.getPropertyValue("--secondary"));
    expect(secondary.h).toBeCloseTo(ACCENT_HSL.light.a5[0], 1);
    expect(secondary.s).toBeGreaterThan(30);

    const sidebar = parseTriplet(root.style.getPropertyValue("--sidebar-background"));
    expect(sidebar.h).toBeCloseTo(ACCENT_HSL.light.a5[0], 1);

    applySemanticAccentTint(root, "light", "a5", false);
    expect(root.dataset.accentTint).toBe("off");
    expect(root.style.getPropertyValue("--secondary")).toBe("");
  });

  it("keeps dark-mode tint as a soft accent whisper", () => {
    const root = document.documentElement;
    applySemanticAccentTint(root, "dark", "a5", true);

    const secondary = parseTriplet(root.style.getPropertyValue("--secondary"));
    expect(secondary.h).toBeCloseTo(ACCENT_HSL.dark.a5[0], 1);
    expect(secondary.l).toBeCloseTo(10, 0);
    expect(secondary.s).toBeGreaterThan(8);
    expect(secondary.s).toBeLessThan(20);

    const background = parseTriplet(root.style.getPropertyValue("--background"));
    expect(background.s).toBeLessThan(16);
  });
});

describe("applyAccentRing", () => {
  it("sets focus ring to full accent and elevation shadow to a light accent mix", () => {
    const root = document.documentElement;
    applyAccentRing(root, "light", "a5");

    const accent = ACCENT_HSL.light.a5;
    const ring = parseTriplet(root.style.getPropertyValue("--ring"));
    expect(ring.h).toBeCloseTo(accent[0], 1);
    expect(ring.s).toBeCloseTo(accent[1], 1);
    expect(ring.l).toBeCloseTo(accent[2], 1);
    expect(root.style.getPropertyValue("--sidebar-ring")).toBe(root.style.getPropertyValue("--ring"));

    const shadow = parseTriplet(root.style.getPropertyValue("--shadow"));
    expect(shadow.h).toBeCloseTo(accent[0], 1);
    expect(shadow.s).toBeLessThan(16);
    expect(shadow.l).toBeCloseTo(8, 0);
  });
});
