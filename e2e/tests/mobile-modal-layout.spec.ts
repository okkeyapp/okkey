import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  gotoItemsUnlocked,
  registerBootstrapAndUnlock,
  signInWithEmailOtp,
} from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { dismissOpenItemDialog } from "../helpers/items";
import {
  assertDialogActionButtonsInViewport,
  assertNoHorizontalOverflow,
  assertPendingDeviceRowsDoNotOverlap,
} from "../helpers/modalLayout";

/**
 * Narrow-viewport layout checks for popup footers (device approval + another modal).
 * CI installs Chromium only, so we reuse iPhone 13 metrics on Chromium instead of WebKit.
 */
const iphone = devices["iPhone 13"];

test.use({
  viewport: iphone.viewport ?? { width: 390, height: 844 },
  userAgent: iphone.userAgent,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: iphone.deviceScaleFactor,
});

test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let context: BrowserContext;
let page: Page;
let email = "";

test.beforeAll(async ({ browser }) => {
  await resetE2eCatalog();
  browserRef = browser;
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

test("register on iPhone viewport", async () => {
  email = uniqueEmail("mobile-modal");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("new-item picker modal footer stays in viewport", async () => {
  test.skip(!email, "registration did not run");
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await dismissOpenItemDialog(page);

  await page.getByTestId("items-shell-topbar").getByRole("button", { name: /^create item$/i }).click();
  const dialog = page.locator("#newItem");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const cancel = dialog.getByRole("button", { name: /^cancel$/i });
  await assertDialogActionButtonsInViewport(page, dialog, [cancel]);

  // Also cover a 320px-wide phone edge case used in acceptance.
  await page.setViewportSize({ width: 320, height: 568 });
  await assertDialogActionButtonsInViewport(page, dialog, [cancel]);
  await page.setViewportSize(iphone.viewport ?? { width: 390, height: 844 });

  // Mobile sheet does not dismiss on Escape; use the footer Cancel action.
  await cancel.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
});

test("device-approval popup fits narrow screens", async () => {
  test.skip(!email, "registration did not run");
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);

  const second = await browserRef.newContext({
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page2 = await second.newPage();
  try {
    await signInWithEmailOtp(page2, email);
    await expect(page2).toHaveURL(/\/account\/device-pending/, { timeout: 60_000 });
    await expect(page2.getByRole("heading", { name: /confirm this device/i })).toBeVisible({
      timeout: 30_000,
    });

    const approval = page.getByRole("dialog");
    const trust = approval.getByRole("button", { name: /^trust device$/i });
    const notNow = approval.getByRole("button", { name: /^not now$/i });
    await expect(trust).toBeVisible({ timeout: 60_000 });
    await expect(notNow).toBeVisible();

    await assertDialogActionButtonsInViewport(page, approval, [trust, notNow]);
    if ((await approval.getByTestId("pending-device-info-card").count()) > 0) {
      await assertPendingDeviceRowsDoNotOverlap(approval);
    }

    await page.setViewportSize({ width: 320, height: 568 });
    await assertDialogActionButtonsInViewport(page, approval, [trust, notNow]);
    if ((await approval.getByTestId("pending-device-info-card").count()) > 0) {
      await assertPendingDeviceRowsDoNotOverlap(approval);
    }

    // Keep the pending session tidy for later suites sharing the DB.
    await notNow.click();
    await expect(page2.getByRole("heading", { name: /this device was denied/i })).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await second.close();
  }
});
