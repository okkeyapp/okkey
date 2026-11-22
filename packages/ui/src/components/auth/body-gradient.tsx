/**
 * Full-viewport decorative backdrop (light + dark). Parent should be `relative`.
 * Gradients come from `--page-gradient-*` (set by `applyPageBackgroundGradients` /
 * `applyStoredTheme`). Dark theme, monochrome accent, or accent-tint-off use solid `--secondary`.
 */
export function BodyGradient() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{ backgroundImage: "var(--page-gradient-light)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{ backgroundImage: "var(--page-gradient-dark)" }}
        aria-hidden
      />
    </>
  );
}
