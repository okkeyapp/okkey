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
