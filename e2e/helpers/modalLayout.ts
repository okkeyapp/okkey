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

/** Assert every visible dialog button stays fully inside the viewport. */
export async function assertDialogButtonsInViewport(
  page: Page,
  dialog: Locator = page.getByRole("dialog"),
): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const { width, height } = viewport!;

  await expect(dialog).toBeVisible();
  await assertNoHorizontalOverflow(page, dialog);

  const buttons = dialog.getByRole("button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) {
      continue;
    }
    const box = await button.boundingBox();
    expect(box, `button #${i} should have a bounding box`).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
  }
}
