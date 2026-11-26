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
  assertDocumentFitsViewport,
  assertMobilePageChrome,
  assertMobileViewportMeta,
  assertVisibleInputFontSizeAtLeast16,
} from "../helpers/mobileViewport";

/**
 * TSK-307: mobile viewport opens at 100%, no horizontal page scroll, inputs ≥16px,
 * viewport meta caps scale. CI installs Chromium only — use iPhone metrics on Chromium.
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

test("auth email: viewport meta, fit, and input font-size on phone sizes", async () => {
  for (const vp of MOBILE_VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/auth/email");
    // Empty self-host catalog redirects /auth/email → /setup (first-run wizard).
    await expect(
      page.getByRole("heading", { name: /first-run setup|welcome to okkey/i }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await assertMobileViewportMeta(page);
    await assertDocumentFitsViewport(page);
    await assertVisibleInputFontSizeAtLeast16(page);
  }
  await page.setViewportSize(iphone.viewport ?? { width: 390, height: 844 });
});

test("register → unlock → vault list fits mobile viewport", async () => {
  email = uniqueEmail("mobile-viewport");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible();
  await dismissOpenItemDialog(page);
  await assertMobilePageChrome(page, { checkInput: true });
});

test("item detail and edit form fit mobile viewport", async () => {
  test.skip(!email, "registration did not run");
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await dismissOpenItemDialog(page);

  const personalData = page.getByRole("button", { name: /personal data/i }).first();
  await expect(personalData).toBeVisible({ timeout: 60_000 });
  await personalData.click();

  await expect(page).toHaveURL(/[?&]item=/, { timeout: 30_000 });
  await assertDocumentFitsViewport(page);
  await assertMobileViewportMeta(page);

  await page.getByRole("button", { name: /^edit$/i }).click();
  const dialog = page.locator("#editItem");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await assertDocumentFitsViewport(page);
  await assertVisibleInputFontSizeAtLeast16(page);
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  const leave = page.getByRole("heading", { name: /leave without saving/i });
  if (await leave.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^continue$/i }).click();
  }
  await expect(dialog).toBeHidden({ timeout: 15_000 });
});

test("settings and mobile drawer fit viewport", async () => {
  test.skip(!email, "registration did not run");
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await dismissOpenItemDialog(page);

  await page.getByRole("button", { name: /^open menu$/i }).click();
  await assertDocumentFitsViewport(page);

  await gotoUnlocked(page, "/items?popup=settings", E2E_MASTER_PASSWORD);
  const settings = page.locator("#settings");
  await expect(settings).toBeVisible({ timeout: 20_000 });
  await assertDocumentFitsViewport(page);
  await assertMobileViewportMeta(page);

  const settingsInput = page
    .locator(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"])',
    )
    .filter({ visible: true })
    .first();
  if (await settingsInput.isVisible().catch(() => false)) {
    await assertVisibleInputFontSizeAtLeast16(page);
  }

  await settings.getByRole("button", { name: /^close$/i }).click();
  await expect(settings).toBeHidden({ timeout: 15_000 });
});

test("unlock screen fits and keeps 16px inputs", async () => {
  test.skip(!email, "registration did not run");
  await clearTabVaultUnlock(page);
  await page.goto("/account/lock");
  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 60_000,
  });
  await assertMobilePageChrome(page);
  // Keep suite tidy for any later local re-runs sharing the context.
  await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);
});
