import { expect, type Locator, type Page } from "@playwright/test";

/** Assert the page (and optional dialog) has no horizontal overflow past the viewport. */
export async function assertNoHorizontalOverflow(
  page: Page,
  root: Locator = page.locator("html"),
): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const width = viewport!.width;

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

  const box = await root.boundingBox();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
}

/**
 * Wait for sheet open animation, then assert dialog has no horizontal overflow and
 * footer/action buttons are fully inside the viewport. Scrollable content buttons
 * are intentionally ignored.
 */
export async function assertDialogActionButtonsInViewport(
  page: Page,
  dialog: Locator,
  actionButtons: Locator[],
): Promise<void> {
  await expect(dialog).toBeVisible();

  // Bottom-sheet enter animation can leave buttons below the fold until it settles.
  const sheet = dialog.locator(".okkey-popup-sheet").first();
  if ((await sheet.count()) > 0) {
    await sheet.evaluate(async (el) => {
      const animations = el.getAnimations({ subtree: true });
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    });
  }

  await assertNoHorizontalOverflow(page, dialog);

  expect(actionButtons.length).toBeGreaterThan(0);
  for (const button of actionButtons) {
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport({ ratio: 1 });
  }
}
