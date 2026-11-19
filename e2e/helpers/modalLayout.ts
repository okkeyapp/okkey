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

function assertBoxInViewport(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  label: string,
): void {
  expect(box.x, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label} right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y, `${label} top`).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 1);
}

/**
 * Assert a dialog fits the viewport horizontally and that specific footer/action
 * buttons stay fully on-screen. Scrollable content buttons are intentionally ignored.
 */
export async function assertDialogActionButtonsInViewport(
  page: Page,
  dialog: Locator,
  actionButtons: Locator[],
): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  await expect(dialog).toBeVisible();
  await assertNoHorizontalOverflow(page, dialog);

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox, "dialog should have a bounding box").toBeTruthy();
  assertBoxInViewport(dialogBox!, viewport!, "dialog");

  expect(actionButtons.length).toBeGreaterThan(0);
  for (const button of actionButtons) {
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box, "action button should have a bounding box").toBeTruthy();
    assertBoxInViewport(box!, viewport!, "action button");
  }
}
