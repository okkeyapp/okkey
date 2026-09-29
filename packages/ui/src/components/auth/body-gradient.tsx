import { PAGE_BACKGROUND_GRADIENT_DARK, PAGE_BACKGROUND_GRADIENT_LIGHT } from "../../lib/page-background-gradients.js";

/**
 * Full-viewport decorative backdrop (light + dark). Parent should be `relative`.
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
