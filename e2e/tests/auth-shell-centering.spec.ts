import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { registerBootstrapAndUnlock } from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import {
  assertAuthCardScrollableAndTopReachable,
  assertAuthCardVerticallyCentered,
  assertDocumentHeightFitsViewport,
  assertViewportFitCover,
} from "../helpers/mobileViewportHeight";

/**
 * Auth shell vertical centering + overflow scroll (follow-up to TSK-308).
 * CI installs Chromium only — use phone metrics on Chromium for mobile cases.
 *
 * Completes first-run setup once so `/auth/email` shows Welcome (empty catalog
 * would redirect to `/setup`, which is covered by mobile-viewport-overflow).
 */
const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 844 } as const;
const SHORT = { width: 375, height: 420 } as const;

const iphone = devices["iPhone 13"];

test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let context: BrowserContext;
let page: Page;

async function clearGuestSession(target: Page, ctx: BrowserContext): Promise<void> {
  await ctx.clearCookies();
  await target.goto("/auth/email");
  await target.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

test.beforeAll(async ({ browser }) => {
  browserRef = browser;
  await resetE2eCatalog();
  context = await browser.newContext({
    locale: "en-US",
    viewport: DESKTOP,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
  await registerBootstrapAndUnlock(page, {
    email: uniqueEmail("auth-shell"),
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await clearGuestSession(page, context);
});

test.afterAll(async () => {
  await context?.close();
  await resetE2eCatalog();
});

test("desktop: auth card is vertically centered without page overflow", async () => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/auth/email");
  await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible({
    timeout: 30_000,
  });
  await assertViewportFitCover(page);
  await assertDocumentHeightFitsViewport(page);
  await assertAuthCardVerticallyCentered(page, { minSideGapPx: 64, maxGapDeltaPx: 120 });
});

test("mobile: auth card is vertically centered without page overflow", async () => {
  await context.close();
  context = await browserRef.newContext({
    locale: "en-US",
    viewport: MOBILE,
    userAgent: iphone.userAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: iphone.deviceScaleFactor,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();

  await page.goto("/auth/email");
  await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible({
    timeout: 30_000,
  });
  await assertViewportFitCover(page);
  await assertDocumentHeightFitsViewport(page);
  await assertAuthCardVerticallyCentered(page, { minSideGapPx: 48, maxGapDeltaPx: 96 });
});

test("short viewport: auth card scrolls and top stays reachable", async () => {
  await page.setViewportSize(SHORT);
  await page.goto("/auth/email");
  await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible({
    timeout: 30_000,
  });
  // Inflate the card so a short phone viewport must scroll.
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="app-shell-card"]');
    if (!(card instanceof HTMLElement)) return;
    const spacer = document.createElement("div");
    spacer.setAttribute("data-testid", "auth-shell-test-spacer");
    spacer.style.height = "520px";
    spacer.setAttribute("aria-hidden", "true");
    card.appendChild(spacer);
  });
  await assertAuthCardScrollableAndTopReachable(page);
});
