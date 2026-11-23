import { expect, type Locator, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

/**
 * True when two axis-aligned boxes overlap by more than `epsilon` px.
 * Edge touching (and sub-pixel gaps from DPR/layout rounding) count as no overlap.
 */
export function boxesOverlap(a: Box, b: Box, epsilon = 1): boolean {
  return !(
    a.x + a.width <= b.x + epsilon ||
    b.x + b.width <= a.x + epsilon ||
    a.y + a.height <= b.y + epsilon ||
    b.y + b.height <= a.y + epsilon
  );
}

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

/** Assert pending-device identity and geo rows do not overlap (desktop or mobile). */
export async function assertPendingDeviceRowsDoNotOverlap(dialog: Locator): Promise<void> {
  // Bottom-sheet enter animation can leave intermediate boxes overlapping until settle.
  const sheet = dialog.locator(".okkey-popup-sheet").first();
  if ((await sheet.count()) > 0) {
    await sheet.evaluate(async (el) => {
      const animations = el.getAnimations({ subtree: true });
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    });
  }

  const identity = dialog.getByTestId("pending-device-identity");
  const geo = dialog.getByTestId("pending-device-geo");
  const title = dialog.getByTestId("pending-device-title");
  const country = dialog.getByTestId("pending-device-country");

  await expect(identity).toBeVisible();
  await expect(geo).toBeVisible();
  await expect(title).toBeVisible();
  await expect(country).toBeVisible();

  const identityBox = await identity.boundingBox();
  const geoBox = await geo.boundingBox();
  const titleBox = await title.boundingBox();
  const countryBox = await country.boundingBox();
  expect(identityBox, "identity column box").toBeTruthy();
  expect(geoBox, "geo column box").toBeTruthy();
  expect(titleBox, "device title box").toBeTruthy();
  expect(countryBox, "country row box").toBeTruthy();

  expect(boxesOverlap(identityBox!, geoBox!), "identity vs geo columns").toBe(false);
  expect(boxesOverlap(titleBox!, countryBox!), "device title vs Country row").toBe(false);
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
