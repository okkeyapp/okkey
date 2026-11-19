import { expect, type Page } from "@playwright/test";

const EXPECTED_VIEWPORT_META =
  /width=device-width,\s*initial-scale=1,\s*maximum-scale=1,\s*user-scalable=no/i;

/** Assert document scrollWidth fits the layout viewport (no page-level horizontal scroll). */
export async function assertDocumentFitsViewport(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      innerWidth: window.innerWidth,
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual((viewport?.width ?? metrics.innerWidth) + 1);
}

/** Assert the SPA shell viewport meta disables pinch / auto scale beyond 100%. */
export async function assertMobileViewportMeta(page: Page): Promise<void> {
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content ?? "").toMatch(EXPECTED_VIEWPORT_META);
}

/**
 * Assert the first visible text-like input has computed font-size ≥ 16px
 * (iOS Safari focus-zoom threshold).
 */
export async function assertVisibleInputFontSizeAtLeast16(page: Page): Promise<void> {
  const input = page
    .locator(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="color"])',
    )
    .filter({ visible: true })
    .first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  const fontSizePx = await input.evaluate((el) => {
    const raw = window.getComputedStyle(el).fontSize;
    return Number.parseFloat(raw);
  });
  expect(fontSizePx).toBeGreaterThanOrEqual(16);
}

/** Viewport meta + no horizontal overflow + input font-size floor for the current page. */
export async function assertMobilePageChrome(page: Page, options?: { checkInput?: boolean }): Promise<void> {
  await assertMobileViewportMeta(page);
  await assertDocumentFitsViewport(page);
  if (options?.checkInput !== false) {
    const count = await page
      .locator(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="color"])',
      )
      .filter({ visible: true })
      .count();
    if (count > 0) {
      await assertVisibleInputFontSizeAtLeast16(page);
    }
  }
}
