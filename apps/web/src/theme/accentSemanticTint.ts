/**
 * Optional “accent tint”: nudge semantic neutrals (secondary, muted, border, foreground)
 * toward the current accent in hue/saturation only — **lightness stays on the base token**
 * so surfaces don’t get darker in light mode or lighter in dark mode.
 */

export const ACCENT_TINT_STORAGE_KEY = "okkey.accentTint";

const ACCENT_IDS = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);

export function readAccentTintEnabled(): boolean {
  try {
    const v = window.localStorage.getItem(ACCENT_TINT_STORAGE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function writeAccentTintEnabled(on: boolean): void {
  try {
    if (on) {
      window.localStorage.setItem(ACCENT_TINT_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(ACCENT_TINT_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

type Hsl = readonly [number, number, number];

type SemanticBaseKey = "secondary" | "muted" | "mutedForeground" | "border" | "input" | "foreground";

/** --accent / --primary source per theme (same numbers as `index.css`). */
const ACCENT_HSL: Record<"light" | "dark", Record<string, Hsl>> = {
  light: {
    a1: [0, 0, 9],
    a2: [217.2, 91.2, 59.8],
    a3: [188.7, 94.5, 42.7],
    a4: [161.4, 93.5, 30.4],
    a5: [24.6, 95.0, 53.1],
    a6: [333.3, 71.4, 50.6],
    a7: [262.1, 83.3, 57.8],
  },
  dark: {
    a1: [0, 0, 98],
    a2: [217.2, 91.2, 59.8],
    a3: [188.7, 94.5, 42.7],
    a4: [158.1, 64.4, 51.6],
    a5: [24.6, 95.0, 53.1],
    a6: [328.6, 85.5, 70.2],
    a7: [255.1, 91.7, 76.3],
  },
};

const BASE_LIGHT: Record<SemanticBaseKey, Hsl> = {
  secondary: [210, 40, 96.1],
  muted: [210, 40, 96.1],
  mutedForeground: [215.4, 16.3, 46.9],
  border: [214.3, 31.8, 91.4],
  input: [214.3, 31.8, 91.4],
  foreground: [222.2, 84, 4.9],
};

const BASE_DARK: Record<SemanticBaseKey, Hsl> = {
  secondary: [217.2, 32.6, 17.5],
  muted: [217.2, 32.6, 17.5],
  mutedForeground: [215, 20.2, 65.1],
  border: [217.2, 32.6, 17.5],
  input: [217.2, 32.6, 17.5],
  foreground: [210, 40, 98],
};

const TINT_ROWS: readonly { cssVar: string; baseKey: SemanticBaseKey; weight: number }[] = [
  { cssVar: "--secondary", baseKey: "secondary", weight: 0.14 },
  { cssVar: "--muted", baseKey: "muted", weight: 0.14 },
  { cssVar: "--muted-foreground", baseKey: "mutedForeground", weight: 0.1 },
  { cssVar: "--border", baseKey: "border", weight: 0.12 },
  { cssVar: "--input", baseKey: "input", weight: 0.12 },
  { cssVar: "--foreground", baseKey: "foreground", weight: 0.055 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHue(h1: number, h2: number, t: number): number {
  let d = h2 - h1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  let h = h1 + d * t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return h;
}

function formatHslTriplet(h: number, s: number, l: number): string {
  return `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`;
}

function mixHslPreserveLightness(base: Hsl, accent: Hsl, t: number): string {
  const h = lerpHue(base[0], accent[0], t);
  const s = lerp(base[1], accent[1], t);
  const ll = base[2];
  return formatHslTriplet(h, s, ll);
}

const TINT_INLINE_VARS = TINT_ROWS.map((r) => r.cssVar);

export function clearSemanticAccentTintInline(root: HTMLElement): void {
  for (const v of TINT_INLINE_VARS) {
    root.style.removeProperty(v);
  }
}

/**
 * When `enabled`, sets inline `--secondary`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--foreground`.
 * When disabled, clears those inline properties so stylesheet tokens apply.
 */
export function applySemanticAccentTint(
  root: HTMLElement,
  theme: "light" | "dark",
  accentId: string,
  enabled: boolean,
): void {
  clearSemanticAccentTintInline(root);

  if (!enabled) {
    root.dataset.accentTint = "off";
    return;
  }

  if (!ACCENT_IDS.has(accentId)) {
    root.dataset.accentTint = "off";
    return;
  }

  const mode = theme === "dark" ? "dark" : "light";
  const accent = ACCENT_HSL[mode][accentId];
  const baseMap = mode === "dark" ? BASE_DARK : BASE_LIGHT;

  root.dataset.accentTint = "on";

  for (const { cssVar, baseKey, weight } of TINT_ROWS) {
    root.style.setProperty(cssVar, mixHslPreserveLightness(baseMap[baseKey], accent, weight));
  }
}
