import { expect, test } from "@playwright/test";

import { gotoItemsUnlocked, registerBootstrapAndUnlock } from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { createLoginItem, openLoginItemForEdit } from "../helpers/items";

/**
 * TSK-303: Login / Password items can be saved without a website URL.
 */
test.describe.configure({ mode: "serial" });

const LOGIN_TITLE = "Login Without URL";
const LOGIN_USER = "nourl@example.com";
const LOGIN_PASSWORD = "PlaintextSecret-NoUrl-7c2e";

test.beforeAll(async () => {
  await resetE2eCatalog();
});

test.afterAll(async () => {
  await resetE2eCatalog();
});

test("create login without URL → save → reopen empty URL", async ({ page }) => {
  const email = uniqueEmail("login-no-url");
  await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);

  await createLoginItem(page, {
    title: LOGIN_TITLE,
    login: LOGIN_USER,
    password: LOGIN_PASSWORD,
  });

  const dialog = await openLoginItemForEdit(page, LOGIN_TITLE);
  await expect(dialog.getByLabel(/item name/i)).toHaveValue(LOGIN_TITLE);
  await expect(dialog.getByPlaceholder(/^enter login$/i)).toHaveValue(LOGIN_USER);
  await expect(dialog.getByPlaceholder("https://example.com")).toHaveValue("");
  await expect(dialog.getByRole("button", { name: /^save$/i })).toBeDisabled();
});
