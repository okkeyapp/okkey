import { expect, type Page } from "@playwright/test";

/**
 * Dismiss the first-sign-in product tour when present so later item flows are not blocked.
 * Checks immediately, then briefly waits for a late-appearing tour after unlock/profile fetch.
 */
export async function skipProductTourIfVisible(page: Page): Promise<void> {
  const overlay = page.getByTestId("product-tour-overlay");

  const skipNow = async () => {
    await page.getByTestId("product-tour-skip").click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });
  };

  if (await overlay.isVisible().catch(() => false)) {
    await skipNow();
    return;
  }

  const appeared = await overlay
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    return;
  }
  await skipNow();
}
