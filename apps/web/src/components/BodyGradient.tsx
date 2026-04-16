import { PAGE_BACKGROUND_GRADIENT_DARK, PAGE_BACKGROUND_GRADIENT_LIGHT } from "../theme/pageBackgroundGradients";

/**
 * Full-viewport decorative backdrop (light + dark). Parent should be `relative` (e.g. `min-h-screen`).
 */
export function BodyGradient() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{ backgroundImage: PAGE_BACKGROUND_GRADIENT_LIGHT }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{ backgroundImage: PAGE_BACKGROUND_GRADIENT_DARK }}
        aria-hidden
      />
    </>
  );
}
