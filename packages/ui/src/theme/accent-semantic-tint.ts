/**
 * Optional “accent tint”: nudge semantic neutrals (background, card, secondary, muted, border, foreground, …)
 * toward the current accent — **lightness stays on the base token**
 * so surfaces don’t get darker in light mode or lighter in dark mode.
 *
 * Near-neutral bases use the accent hue directly (not a mid-lerp), so tint reads as the
 * selected accent instead of an intermediate (e.g. purple between blue-gray and orange).
 */

export const ACCENT_TINT_STORAGE_KEY = "okkey.accentTint";

const ACCENT_IDS = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);

/** Parse stored accent-tint flag. Missing / empty → enabled by default. */
export function parseAccentTintEnabled(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") {
    return true;
  }
  if (raw === "0" || raw === "false") {
    return false;
  }
  return raw === "1" || raw === "true";
}

export function readAccentTintEnabled(): boolean {
  try {
    return parseAccentTintEnabled(window.localStorage.getItem(ACCENT_TINT_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function writeAccentTintEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(ACCENT_TINT_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

type Hsl = readonly [number, number, number];

type SemanticBaseKey =
  | "background"
  | "card"
  | "popover"
  | "secondary"
  | "muted"
  | "mutedForeground"
  | "border"
  | "input"
  | "foreground"
  | "sidebarBackground"
  | "sidebarAccent";

/** --accent / --primary source per theme (same numbers as `index.css`). */
export const ACCENT_HSL: Record<"light" | "dark", Record<string, Hsl>> = {
  light: {
    a1: [0, 0, 9.0],
    a2: [217.2, 93.2, 59.8],
    a3: [188.7, 96.2, 42.7],
    a4: [159.8, 83.5, 41.0],
    a5: [24.6, 97.0, 53.1],
    a6: [331.0, 82.5, 60.4],
    a7: [258.6, 90.5, 67.1],
  },
  dark: {
    a1: [0, 0, 98.0],
    a2: [217.2, 93.2, 59.8],
    a3: [188.7, 96.2, 42.7],
    a4: [159.8, 83.5, 41.0],
    a5: [24.6, 97.0, 53.1],
    a6: [331.0, 82.5, 60.4],
    a7: [258.6, 90.5, 67.1],
  },
};

/** Zinc-like neutrals — must stay in sync with `apps/web/src/index.css` / extension.css. */
const BASE_LIGHT: Record<SemanticBaseKey, Hsl> = {
  background: [0, 0, 100],
  card: [0, 0, 100],
  popover: [0, 0, 100],
  secondary: [240, 4.8, 95.9],
  muted: [240, 4.8, 95.9],
  mutedForeground: [240, 3.8, 46.1],
  border: [240, 5.9, 90],
  input: [240, 5.9, 90],
  foreground: [240, 10, 3.9],
  sidebarBackground: [240, 4.8, 98],
  sidebarAccent: [240, 4.8, 95.9],
};

/** True neutral charcoal — keep in sync with `.dark` in web/extension CSS. */
const BASE_DARK: Record<SemanticBaseKey, Hsl> = {
  background: [0, 0, 7],
  card: [0, 0, 7],
  popover: [0, 0, 7],
  secondary: [0, 0, 10],
  muted: [0, 0, 10],
  mutedForeground: [0, 0, 64.9],
  border: [0, 0, 15.9],
  input: [0, 0, 15.9],
  foreground: [0, 0, 98],
  sidebarBackground: [0, 0, 7],
  sidebarAccent: [0, 0, 18],
};

/**
 * Mix weights per theme. Light keeps a clear tint; dark stays a soft whisper
 * (high-chroma accents at L≈7–10% otherwise read as neon surfaces).
 */
const TINT_ROWS: readonly {
  cssVar: string;
  baseKey: SemanticBaseKey;
  light: number;
  dark: number;
}[] = [
  { cssVar: "--background", baseKey: "background", light: 0.28, dark: 0.1 },
  { cssVar: "--card", baseKey: "card", light: 0.28, dark: 0.1 },
  { cssVar: "--popover", baseKey: "popover", light: 0.28, dark: 0.1 },
  { cssVar: "--secondary", baseKey: "secondary", light: 0.42, dark: 0.14 },
  { cssVar: "--muted", baseKey: "muted", light: 0.42, dark: 0.14 },
  // Secondary copy / borders — light accent whisper in both themes.
  { cssVar: "--muted-foreground", baseKey: "mutedForeground", light: 0.1, dark: 0.06 },
  { cssVar: "--border", baseKey: "border", light: 0.1, dark: 0.06 },
  { cssVar: "--input", baseKey: "input", light: 0.1, dark: 0.06 },
  { cssVar: "--foreground", baseKey: "foreground", light: 0.18, dark: 0.08 },
  { cssVar: "--sidebar-background", baseKey: "sidebarBackground", light: 0.32, dark: 0.11 },
  { cssVar: "--sidebar-accent", baseKey: "sidebarAccent", light: 0.42, dark: 0.14 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function formatHslTriplet(h: number, s: number, l: number): string {
  return `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`;
}

/**
 * Tint a neutral toward the accent: keep base lightness, pull saturation by `t`,
 * and use the accent hue so the result reads as that accent (not a mid-hue).
 * Exported for unit tests.
 */
export function mixHslPreserveLightness(base: Hsl, accent: Hsl, t: number): string {
  const h = accent[0];
  const s = lerp(base[1], accent[1], t);
  const ll = base[2];
  return formatHslTriplet(h, s, ll);
}

const TINT_INLINE_VARS = TINT_ROWS.map((r) => r.cssVar);

/**
 * Soft elevation shadows (blurred, resting state): mostly gray/black with a light accent whisper.
 * Focus rings without blur stay on `--accent` / `--ring` at full accent.
 */
const ELEVATION_SHADOW_ACCENT_WEIGHT = 0.1;
const ELEVATION_SHADOW_BASE_LIGHT: Hsl = [240, 5, 8];
const ELEVATION_SHADOW_BASE_DARK: Hsl = [0, 0, 100];

export function clearSemanticAccentTintInline(root: HTMLElement): void {
  for (const v of TINT_INLINE_VARS) {
    root.style.removeProperty(v);
  }
}

/**
 * Always set focus `--ring` to the accent, and `--shadow` to a near-neutral
 * elevation color with only a light accent mix (for blurred resting shadows).
 */
export function applyAccentRing(root: HTMLElement, theme: "light" | "dark", accentId: string): void {
  const mode = theme === "dark" ? "dark" : "light";
  const table = ACCENT_HSL[mode];
  const accent = table[accentId] ?? table.a2 ?? ACCENT_HSL.light.a2;
  const ring = `${accent[0]} ${accent[1].toFixed(1)}% ${accent[2].toFixed(1)}%`;
  root.style.setProperty("--ring", ring);
  root.style.setProperty("--sidebar-ring", ring);

  const shadowBase = mode === "dark" ? ELEVATION_SHADOW_BASE_DARK : ELEVATION_SHADOW_BASE_LIGHT;
  root.style.setProperty(
    "--shadow",
    mixHslPreserveLightness(shadowBase, accent, ELEVATION_SHADOW_ACCENT_WEIGHT),
  );
}

/**
 * When `enabled`, sets inline semantic vars including `--background`, `--card`, `--secondary`, `--muted`,
 * `--muted-foreground`, `--border`, `--input`, `--foreground`, sidebar/popover tokens.
 * When disabled, clears those inline properties so stylesheet tokens apply.
 */
/** `--primary` / `--accent` HSL triplet for a stored accent id. */
export function accentPrimaryHslTriplet(theme: "light" | "dark", accentId: string): string {
  const table = ACCENT_HSL[theme];
  const hsl = table[accentId] ?? table.a2 ?? ACCENT_HSL.light.a2;
  return `${hsl[0]} ${hsl[1].toFixed(1)}% ${hsl[2].toFixed(1)}%`;
}

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

  for (const { cssVar, baseKey, light, dark } of TINT_ROWS) {
    const weight = mode === "dark" ? dark : light;
    root.style.setProperty(cssVar, mixHslPreserveLightness(baseMap[baseKey], accent, weight));
  }
}
