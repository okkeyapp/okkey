/**
 * Shell / demo backdrop washes — accent-aware (light only).
 *
 * `a2` (blue) keeps the original blue → warm cream look.
 * Other chromatic accents get analogous soft washes.
 * Monochrome `a1` / tint-off / **all dark themes** use solid `--secondary`.
 */

export type PageBackgroundAccentId = "a1" | "a2" | "a3" | "a4" | "a5" | "a6" | "a7";

/** Solid secondary fill via background-image (BodyGradient only sets backgroundImage). */
const MONO_SOLID = "linear-gradient(hsl(var(--secondary)), hsl(var(--secondary)))";

function lightWash(diagonalRgb: string, verticalFrom: string, verticalTo: string): string {
  return (
    `linear-gradient(136.85deg, ${diagonalToTransparent(diagonalRgb)} 8.44%, ${diagonalRgb} 91.56%), ` +
    `linear-gradient(180deg, ${verticalFrom} 0%, ${verticalTo} 100%)`
  );
}

/** `rgb(r, g, b)` / `rgb(r g b)` → same channels with alpha 0 for the diagonal fade. */
function diagonalToTransparent(rgb: string): string {
  const m = rgb.match(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
  if (!m) {
    return "transparent";
  }
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, 0)`;
}

/** Classic blue accent backdrop (unchanged brand look). */
const A2_LIGHT = lightWash("rgb(255, 248, 239)", "rgb(234, 240, 250)", "rgb(242, 255, 252)");

/**
 * Per-accent light washes (matched to a2 softness).
 * Recipe like blue: muted top wash + clearly different complementary bottom,
 * plus a soft warm diagonal. Avoid high-chroma pastels at the top-left.
 * Dark theme always uses solid `--secondary` (no decorative wash).
 */
const ACCENT_GRADIENTS_LIGHT: Record<PageBackgroundAccentId, string> = {
  a1: MONO_SOLID,
  a2: A2_LIGHT,
  // Cyan → soft cyan-gray top, warm cream bottom (hue contrast like blue→mint)
  a3: lightWash("rgb(255, 248, 239)", "rgb(232, 240, 244)", "rgb(252, 246, 238)"),
  // Green → soft sage top, warm peach bottom
  a4: lightWash("rgb(255, 248, 239)", "rgb(232, 242, 236)", "rgb(252, 246, 236)"),
  // Orange → muted peach-gray top, soft cool blue bottom (complement)
  a5: lightWash("rgb(255, 248, 242)", "rgb(244, 238, 232)", "rgb(232, 238, 248)"),
  // Pink → muted blush top, soft sage/mint bottom
  a6: lightWash("rgb(255, 246, 248)", "rgb(244, 236, 240)", "rgb(232, 244, 240)"),
  // Purple → muted lavender top, soft warm peach bottom
  a7: lightWash("rgb(250, 246, 252)", "rgb(236, 234, 244)", "rgb(252, 244, 236)"),
};

function normalizeAccentId(accentId: string | null | undefined): PageBackgroundAccentId {
  if (accentId && accentId in ACCENT_GRADIENTS_LIGHT) {
    return accentId as PageBackgroundAccentId;
  }
  return "a2";
}

/**
 * Resolve backdrop gradient CSS for theme + accent.
 * Dark theme always uses solid `--secondary`.
 * When accent tint is off (light), use the monochrome secondary fill (same as `a1`).
 */
export function pageBackgroundGradient(
  theme: "light" | "dark",
  accentId: string | null | undefined,
  accentTintEnabled = true,
): string {
  if (theme === "dark") {
    return MONO_SOLID;
  }
  if (!accentTintEnabled) {
    return MONO_SOLID;
  }
  return ACCENT_GRADIENTS_LIGHT[normalizeAccentId(accentId)];
}

/** @deprecated Prefer `pageBackgroundGradient("light", accentId)` — kept as a2 classic for theme chips. */
export const PAGE_BACKGROUND_GRADIENT_LIGHT = A2_LIGHT;

/** @deprecated Dark theme no longer uses washes — solid secondary. */
export const PAGE_BACKGROUND_GRADIENT_DARK = MONO_SOLID;

/**
 * Writes `--page-gradient-light` / `--page-gradient-dark` on the document root
 * so `BodyGradient` updates without a React re-render when accent/tint changes.
 */
export function applyPageBackgroundGradients(
  root: HTMLElement,
  accentId: string | null | undefined,
  accentTintEnabled = true,
): void {
  root.style.setProperty(
    "--page-gradient-light",
    pageBackgroundGradient("light", accentId, accentTintEnabled),
  );
  root.style.setProperty(
    "--page-gradient-dark",
    pageBackgroundGradient("dark", accentId, accentTintEnabled),
  );
}
