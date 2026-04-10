/**
 * Optional “accent tint”: nudge semantic neutrals (background, card, secondary, muted, border, foreground, …)
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

type SemanticBaseKey =
  | "background"
  | "card"
  | "secondary"
  | "muted"
  | "mutedForeground"
  | "border"
  | "input"
  | "foreground";

/** --accent / --primary source per theme (same numbers as `index.css`). */
const ACCENT_HSL: Record<"light" | "dark", Record<string, Hsl>> = {
  light: {
    a1: [215, 5.0, 9.0],
    a2: [217.2, 93.2, 59.8],
    a3: [188.7, 96.2, 42.7],
    a4: [159.8, 83.5, 41.0],
    a5: [24.6, 97.0, 53.1],
    a6: [331.0, 82.5, 60.4],
    a7: [258.6, 90.5, 67.1],
  },
  dark: {
    a1: [215, 4.0, 98.0],
    a2: [217.2, 93.2, 59.8],
    a3: [188.7, 96.2, 42.7],
    a4: [159.8, 83.5, 41.0],
    a5: [24.6, 97.0, 53.1],
    a6: [331.0, 82.5, 60.4],
    a7: [258.6, 90.5, 67.1],
  },
};

const BASE_LIGHT: Record<SemanticBaseKey, Hsl> = {
  background: [0, 0, 100],
  card: [0, 0, 100],
  secondary: [210, 40, 96.1],
  muted: [210, 40, 96.1],
  mutedForeground: [215.4, 16.3, 46.9],
  border: [214.3, 31.8, 91.4],
  input: [214.3, 31.8, 91.4],
  foreground: [222.2, 84, 4.9],
};

const BASE_DARK: Record<SemanticBaseKey, Hsl> = {
  background: [222.2, 84, 4.9],
  card: [222.2, 84, 4.9],
  secondary: [217.2, 32.6, 17.5],
  muted: [217.2, 32.6, 17.5],
  mutedForeground: [215, 20.2, 65.1],
  border: [217.2, 32.6, 17.5],
  input: [217.2, 32.6, 17.5],
  foreground: [210, 40, 98],
};

const TINT_ROWS: readonly { cssVar: string; baseKey: SemanticBaseKey; weight: number }[] = [
  { cssVar: "--background", baseKey: "background", weight: 0.09 },
  { cssVar: "--card", baseKey: "card", weight: 0.09 },
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
 * When `enabled`, sets inline semantic vars including `--background`, `--card`, `--secondary`, `--muted`,
 * `--muted-foreground`, `--border`, `--input`, `--foreground`.
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
