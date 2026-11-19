import { expect, type Page } from "@playwright/test";

/**
 * Dismiss the first-sign-in product tour when present so later item flows are not blocked.
 * Safe to call when the tour was already completed or skipped.
 */
export async function skipProductTourIfVisible(page: Page): Promise<void> {
  const overlay = page.getByTestId("product-tour-overlay");
  const visible = await overlay.isVisible().catch(() => false);
  if (!visible) {
    return;
  }
  await page.getByTestId("product-tour-skip").click();
  await expect(overlay).toBeHidden({ timeout: 15_000 });
}
