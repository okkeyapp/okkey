import { expect, type Page } from "@playwright/test";

/**
 * Combined mobile viewport (TSK-308 + TSK-307/#373):
 * safe-area (`viewport-fit=cover`) and zoom caps (`maximum-scale=1`, `user-scalable=no`).
 */
const COMBINED_MOBILE_VIEWPORT =
  /width=device-width/i.source +
  ".*" +
  /initial-scale\s*=\s*1/i.source +
  ".*" +
  /maximum-scale\s*=\s*1/i.source +
  ".*" +
  /user-scalable\s*=\s*no/i.source +
  ".*" +
  /viewport-fit\s*=\s*cover/i.source;

const COMBINED_MOBILE_VIEWPORT_RE = new RegExp(COMBINED_MOBILE_VIEWPORT, "i");

/**
 * Assert document scrollHeight does not exceed the layout viewport
 * (no extra vertical page scroll from 100vh / Safari toolbars).
 */
export async function assertDocumentHeightFitsViewport(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      scrollHeight: Math.max(doc.scrollHeight, body?.scrollHeight ?? 0),
      clientHeight: doc.clientHeight,
      innerHeight: window.innerHeight,
      bodyMinHeight: body ? window.getComputedStyle(body).minHeight : "",
      rootMinHeight: window.getComputedStyle(doc.querySelector("#root") ?? doc).minHeight,
    };
  });

  // Allow 1px subpixel slack; document must not be taller than the visual viewport.
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  expect(metrics.scrollHeight).toBeLessThanOrEqual((viewport?.height ?? metrics.innerHeight) + 1);
}

/** Assert viewport meta keeps TSK-308 safe-area + TSK-307 zoom caps together. */
export async function assertViewportFitCover(page: Page): Promise<void> {
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content ?? "").toMatch(COMBINED_MOBILE_VIEWPORT_RE);
}

/**
 * Assert body / #root prefer dynamic viewport height when the engine supports dvh
 * (computed min-height should resolve to a px value ≤ layout viewport).
 */
export async function assertRootUsesDynamicViewportHeight(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  const mins = await page.evaluate(() => {
    const body = document.body;
    const root = document.getElementById("root");
    const bodyMin = body ? Number.parseFloat(window.getComputedStyle(body).minHeight) : NaN;
    const rootMin = root ? Number.parseFloat(window.getComputedStyle(root).minHeight) : NaN;
    return { bodyMin, rootMin, innerHeight: window.innerHeight };
  });

  expect(mins.bodyMin).toBeGreaterThan(0);
  expect(mins.rootMin).toBeGreaterThan(0);
  // With dvh/svh support (Chromium in CI), min-height should not exceed the viewport.
  expect(mins.bodyMin).toBeLessThanOrEqual((viewport?.height ?? mins.innerHeight) + 1);
  expect(mins.rootMin).toBeLessThanOrEqual((viewport?.height ?? mins.innerHeight) + 1);
}

export type AuthCardGaps = {
  topGap: number;
  bottomGap: number;
  cardHeight: number;
  viewportHeight: number;
};

/** Measure viewport gaps around the auth card (`data-testid="app-shell-card"`). */
export async function measureAuthCardGaps(page: Page): Promise<AuthCardGaps> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  const card = page.getByTestId("app-shell-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  const box = await card.boundingBox();
  expect(box).toBeTruthy();

  const topGap = box!.y;
  const bottomGap = viewport!.height - (box!.y + box!.height);
  return {
    topGap,
    bottomGap,
    cardHeight: box!.height,
    viewportHeight: viewport!.height,
  };
}

/**
 * On a tall viewport the auth card should be roughly vertically centered.
 * Shell padding is py-10 / pb-20 (~40px / 80px), so top vs bottom gaps to the
 * viewport edges are not identical — allow that slack, but reject “stuck at top”
 * (topGap ≈ 40 from padding alone).
 */
export async function assertAuthCardVerticallyCentered(
  page: Page,
  options?: { maxGapDeltaPx?: number; minSideGapPx?: number },
): Promise<AuthCardGaps> {
  const maxGapDeltaPx = options?.maxGapDeltaPx ?? 120;
  const minSideGapPx = options?.minSideGapPx ?? 48;
  const gaps = await measureAuthCardGaps(page);

  expect(gaps.topGap).toBeGreaterThan(minSideGapPx);
  expect(gaps.bottomGap).toBeGreaterThan(minSideGapPx);
  expect(Math.abs(gaps.topGap - gaps.bottomGap)).toBeLessThanOrEqual(maxGapDeltaPx);
  // Padding-only top stick is ~40px (py-10); centered must clear that clearly.
  expect(gaps.topGap).toBeGreaterThan(80);
  return gaps;
}

/**
 * Short viewport: shell scrolls internally; scrolling to the start keeps the
 * title reachable (not clipped by justify-center overflow).
 */
export async function assertAuthCardScrollableAndTopReachable(page: Page): Promise<void> {
  const scroll = page.getByTestId("app-shell-scroll");
  await expect(scroll).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("app-shell-card")).toBeVisible();

  const metrics = await scroll.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 8);

  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(async () => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(8);

  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(async () => scroll.evaluate((el) => el.scrollTop)).toBe(0);

  const title = page.getByTestId("app-shell-title");
  await expect(title).toBeVisible();
  const titleBox = await title.boundingBox();
  expect(titleBox).toBeTruthy();
  // Title near the top of the viewport after scrolling to start.
  expect(titleBox!.y).toBeLessThan(120);
}
