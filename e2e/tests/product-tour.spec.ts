import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { gotoItemsUnlocked, registerBootstrapAndUnlock } from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { skipProductTourIfVisible } from "../helpers/productTour";

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
});

test("product tour appears after first unlock and can be skipped", async () => {
  email = uniqueEmail("tour-skip");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });

  await expect(page.getByTestId("items-shell-topbar")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("product-tour-overlay")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("product-tour-tip")).toContainText(/create items/i);

  await page.getByTestId("product-tour-skip").click();
  await expect(page.getByTestId("product-tour-overlay")).toBeHidden({ timeout: 15_000 });

  await page.reload();
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("product-tour-overlay")).toHaveCount(0);
});

test("product tour walks steps and keeps personal-data step after reload", async () => {
  await context.close();
  await resetE2eCatalog();
  email = uniqueEmail("tour-steps");
  context = await browserRef.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();

  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });

  await expect(page.getByTestId("product-tour-overlay")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("product-tour-tip")).toContainText(/create items/i);
  await page.getByTestId("product-tour-next").click();

  await expect(page.getByTestId("product-tour-tip")).toContainText(/your settings/i, {
    timeout: 15_000,
  });
  await page.getByTestId("product-tour-next").click();

  await expect(page.getByTestId("product-tour-tip")).toContainText(/workspace settings/i, {
    timeout: 15_000,
  });
  await page.getByTestId("product-tour-next").click();

  await expect(page.getByTestId("product-tour-tip")).toContainText(/personal data/i, {
    timeout: 30_000,
  });
  await expect(page.locator("#editItem")).toBeVisible({ timeout: 30_000 });

  // Dismiss overlay only — leave the edit popup open without save/close.
  await page.getByTestId("product-tour-next").click();
  await expect(page.getByTestId("product-tour-overlay")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("#editItem")).toBeVisible();

  await page.reload();
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);

  // Step 4 repeats until the personal-data popup is saved or closed.
  await expect(page.getByTestId("product-tour-overlay")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("product-tour-tip")).toContainText(/personal data/i);
  await expect(page.locator("#editItem")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("product-tour-next").click();
  await expect(page.getByTestId("product-tour-overlay")).toBeHidden({ timeout: 15_000 });

  // Close without saving → tour completes.
  await page.locator("#editItem").getByRole("button", { name: /^cancel$/i }).click({ force: true });
  const leave = page.getByRole("heading", { name: /leave without saving/i });
  if (await leave.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^continue$/i }).click({ force: true });
  }
  await expect(page.locator("#editItem")).toBeHidden({ timeout: 15_000 });

  await page.reload();
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible({ timeout: 60_000 });
  await skipProductTourIfVisible(page);
  await expect(page.getByTestId("product-tour-overlay")).toHaveCount(0);
});
