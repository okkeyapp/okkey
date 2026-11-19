import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { gotoItemsUnlocked, registerBootstrapAndUnlock } from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { dismissOpenItemDialog } from "../helpers/items";

/**
 * TSK-311: Escape closes a real shared Popup (new-item category picker) the
 * same way as the close control, and returns focus to the opener button.
 */
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

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

test("new-item popup closes on Escape and restores opener focus", async () => {
  const email = uniqueEmail("popup-escape");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await dismissOpenItemDialog(page);

  const createButton = page
    .getByTestId("items-shell-topbar")
    .getByRole("button", { name: /^create item$/i });
  await expect(createButton).toBeVisible({ timeout: 30_000 });
  await createButton.click();

  const dialog = page.locator("#newItem");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toHaveAttribute("data-state", "open");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  await expect(createButton).toBeFocused({ timeout: 15_000 });
});
