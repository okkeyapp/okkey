import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { gotoItemsUnlocked, registerBootstrapAndUnlock } from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { dismissOpenItemDialog } from "../helpers/items";

/**
 * Tips banner (TSK-256): show unfinished tips, navigate to a settings target,
 * dismiss persists across reload.
 */
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
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await resetE2eCatalog();
  void browserRef;
});

test("tips banner shows, navigates to settings, dismiss persists after reload", async () => {
  email = uniqueEmail("tips");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible();
  // Personal-data bootstrap may open `#editItem` and block sidebar clicks.
  await dismissOpenItemDialog(page);

  const banner = page.getByTestId("sidebar-tips-banner");
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await expect(banner).toHaveAttribute("data-tip-count", /[1-4]/);

  const tipId = await banner.getAttribute("data-tip-id");
  expect(["setupPin", "enableTwoFactor", "lockOnDeviceLock", "serverEmail"]).toContain(tipId);

  await page.getByTestId("sidebar-tips-cta").click();

  if (tipId === "serverEmail") {
    await expect(page).toHaveURL(/\/settings\/mail/, { timeout: 30_000 });
    await expect(page.getByTestId("server-mail-settings")).toBeVisible({ timeout: 30_000 });
    await page.goto("/items");
    await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  } else {
    await expect(page).toHaveURL(/popup=settings\|/, { timeout: 30_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("button", { name: /^close$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  }

  await expect(page.getByTestId("sidebar-tips-banner")).toBeVisible();
  await page.getByTestId("sidebar-tips-dismiss").click();
  await expect(page.getByTestId("sidebar-tips-banner")).toBeHidden({ timeout: 15_000 });

  await page.reload();
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await expect(page.getByTestId("sidebar-tips-banner")).toBeHidden({ timeout: 30_000 });
});
