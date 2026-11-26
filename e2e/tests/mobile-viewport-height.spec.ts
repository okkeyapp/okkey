import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  clearTabVaultUnlock,
  gotoItemsUnlocked,
  gotoUnlocked,
  registerBootstrapAndUnlock,
  unlockWithMasterPassword,
} from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { dismissOpenItemDialog } from "../helpers/items";
import {
  assertDocumentHeightFitsViewport,
  assertRootUsesDynamicViewportHeight,
  assertViewportFitCover,
} from "../helpers/mobileViewportHeight";

/**
 * TSK-308: mobile Safari-style viewports must not get an extra vertical page scroll
 * from 100vh / h-screen. CI installs Chromium only — use iPhone metrics on Chromium.
 */
const MOBILE_VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 13", width: 390, height: 844 },
  { name: "Android compact", width: 360, height: 800 },
] as const;

const iphone = devices["iPhone 13"];

test.use({
  viewport: iphone.viewport ?? { width: 390, height: 844 },
  userAgent: iphone.userAgent,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: iphone.deviceScaleFactor,
});

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let email = "";

test.beforeAll(async ({ browser }) => {
  await resetE2eCatalog();
  context = await browser.newContext({
    locale: "en-US",
    viewport: iphone.viewport ?? { width: 390, height: 844 },
    userAgent: iphone.userAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: iphone.deviceScaleFactor,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await resetE2eCatalog();
});

test("auth email: no vertical page overflow on phone sizes", async () => {
  for (const vp of MOBILE_VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/auth/email");
    // Empty self-host catalog redirects /auth/email → /setup (first-run wizard).
    await expect(page.getByRole("heading", { name: /first-run setup|welcome to okkey/i })).toBeVisible({
      timeout: 30_000,
    });
    await assertViewportFitCover(page);
    await assertRootUsesDynamicViewportHeight(page);
    await assertDocumentHeightFitsViewport(page);
  }
  await page.setViewportSize(iphone.viewport ?? { width: 390, height: 844 });
});

test("register → unlock → vault list has no vertical page overflow", async () => {
  email = uniqueEmail("mobile-vh");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible();
  await dismissOpenItemDialog(page);
  await assertViewportFitCover(page);
  await assertDocumentHeightFitsViewport(page);
});

test("unlock screen has no vertical page overflow", async () => {
  test.skip(!email, "registration did not run");
  await clearTabVaultUnlock(page);
  await page.goto("/account/lock");
  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 60_000,
  });
  await assertDocumentHeightFitsViewport(page);
  await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);
});

test("settings sheet does not force document taller than viewport", async () => {
  test.skip(!email, "registration did not run");
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await dismissOpenItemDialog(page);

  await gotoUnlocked(page, "/items?popup=settings", E2E_MASTER_PASSWORD);
  const settings = page.locator("#settings");
  await expect(settings).toBeVisible({ timeout: 20_000 });
  await assertDocumentHeightFitsViewport(page);

  await settings.getByRole("button", { name: /^close$/i }).click();
  await expect(settings).toBeHidden({ timeout: 15_000 });
});
