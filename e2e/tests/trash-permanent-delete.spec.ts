import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { gotoItemsUnlocked, registerBootstrapAndUnlock } from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { createLoginItem, dismissOpenItemDialog } from "../helpers/items";

/**
 * TSK-304: soft-delete → permanently delete from Recently deleted; empty trash.
 */
test.describe.configure({ mode: "serial" });

const ITEM_A = "Trash Purge Alpha";
const ITEM_B = "Trash Purge Bravo";
const ITEM_C = "Trash Purge Charlie";

let context: BrowserContext;
let page: Page;
let email = "";

async function openRowActions(page: Page, title: string): Promise<void> {
  const row = page.getByRole("button", { name: new RegExp(title, "i") }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.hover();
  const listItem = row.locator("xpath=ancestor::li[1]");
  await listItem.locator('button[aria-haspopup="menu"]').last().click();
}

async function softDeleteItem(page: Page, title: string): Promise<void> {
  await openRowActions(page, title);
  await page.getByRole("menuitem", { name: /^delete$/i }).click();
  const confirm = page.getByRole("heading", { name: /delete item/i });
  await expect(confirm).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(confirm).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(title, { exact: false }).first()).toBeHidden({ timeout: 30_000 });
}

async function goToRecentlyDeleted(page: Page): Promise<void> {
  // Trigger aria-label is "Filter item list"; visible label is inside the control.
  await page.getByRole("button", { name: /filter item list/i }).click();
  await page.getByRole("menuitem", { name: /recently deleted/i }).click();
  await expect(page.getByText("Recently deleted", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function goToAllItems(page: Page): Promise<void> {
  await page.getByRole("button", { name: /filter item list/i }).click();
  await page.getByRole("menuitem", { name: /^all items$/i }).click();
  await expect(page.getByText("All items", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.beforeAll(async ({ browser }) => {
  await resetE2eCatalog();
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

test("1) register → create item → soft-delete → delete permanently → gone after reload", async () => {
  email = uniqueEmail("trash-purge");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible();

  await createLoginItem(page, {
    title: ITEM_A,
    login: "purge-a@example.com",
    password: "PlaintextSecret-Purge-A",
    url: "https://example.com/a",
  });

  await softDeleteItem(page, ITEM_A);
  await goToRecentlyDeleted(page);
  await expect(page.getByText(ITEM_A, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  await openRowActions(page, ITEM_A);
  await page.getByRole("menuitem", { name: /delete permanently/i }).click();
  const purgeDialog = page.getByRole("dialog");
  await expect(purgeDialog.getByRole("heading", { name: /delete permanently/i })).toBeVisible({
    timeout: 10_000,
  });
  await purgeDialog.getByRole("button", { name: /delete permanently/i }).click();
  await expect(purgeDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(ITEM_A, { exact: false })).toHaveCount(0, { timeout: 30_000 });

  await page.reload();
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await goToRecentlyDeleted(page);
  await expect(page.getByText(ITEM_A, { exact: false })).toHaveCount(0, { timeout: 30_000 });
});

test("2) empty trash removes all soft-deleted items the user may delete", async () => {
  test.skip(!email, "registration did not run");
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await dismissOpenItemDialog(page);
  await goToAllItems(page);
  await dismissOpenItemDialog(page);

  await createLoginItem(page, {
    title: ITEM_B,
    login: "purge-b@example.com",
    password: "PlaintextSecret-Purge-B",
    url: "https://example.com/b",
  });
  await createLoginItem(page, {
    title: ITEM_C,
    login: "purge-c@example.com",
    password: "PlaintextSecret-Purge-C",
    url: "https://example.com/c",
  });

  await softDeleteItem(page, ITEM_B);
  await softDeleteItem(page, ITEM_C);
  await goToRecentlyDeleted(page);
  await expect(page.getByText(ITEM_B, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(ITEM_C, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /empty trash/i }).click();
  const emptyDialog = page.getByRole("dialog");
  await expect(emptyDialog.getByRole("heading", { name: /empty trash/i })).toBeVisible({
    timeout: 10_000,
  });
  await emptyDialog.getByRole("button", { name: /^empty trash$/i }).click();
  await expect(emptyDialog).toBeHidden({ timeout: 30_000 });

  await expect(page.getByText(ITEM_B, { exact: false })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(ITEM_C, { exact: false })).toHaveCount(0, { timeout: 30_000 });

  await page.reload();
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await goToRecentlyDeleted(page);
  await expect(page.getByText(ITEM_B, { exact: false })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(ITEM_C, { exact: false })).toHaveCount(0, { timeout: 30_000 });
});
