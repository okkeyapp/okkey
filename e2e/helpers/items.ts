import { expect, type Locator, type Page } from "@playwright/test";

import { skipProductTourIfVisible } from "./productTour";

/**
 * After first unlock, the product tour (or a leftover edit dialog) may be open.
 * Skip the tour when present, then dismiss any open `#editItem` so Login create
 * is not raced by a late-opening edit dialog.
 */
export async function dismissOpenItemDialog(page: Page): Promise<void> {
  await skipProductTourIfVisible(page);

  const editItem = page.locator("#editItem");
  const personalDataRow = page.getByRole("button", { name: /personal data/i }).first();

  // Silent personal-data create (after tour skip) can take a moment; wait briefly for an
  // unexpected edit dialog, then continue either way.
  await expect
    .poll(
      async () => {
        if (await editItem.isVisible().catch(() => false)) {
          return "edit";
        }
        if (await personalDataRow.isVisible().catch(() => false)) {
          return "row";
        }
        return "idle";
      },
      { timeout: 10_000 },
    )
    .not.toBe("");

  const editVisible = await editItem.isVisible().catch(() => false);
  if (!editVisible) {
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
    return;
  }

  await expect(editItem).toHaveAttribute("data-state", "open", { timeout: 10_000 });
  await editItem.getByRole("button", { name: /^cancel$/i }).click({ force: true });

  const leave = page.getByRole("heading", { name: /leave without saving/i });
  try {
    await leave.waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("button", { name: /^continue$/i }).click({ force: true });
    await expect(leave).toBeHidden({ timeout: 10_000 });
  } catch {
    // Form was not dirty — Cancel already cleared the popup.
  }

  await expect(editItem).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
}

async function fillAndAssert(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

/** Create a Login / Password item via the new-item popup (qa/web 7.1 subset). */
export async function createLoginItem(
  page: Page,
  input: { title: string; login: string; password: string; url: string },
): Promise<void> {
  await dismissOpenItemDialog(page);

  // Sidebar also has a compact "Create item"; prefer the shell top bar.
  await page.getByTestId("items-shell-topbar").getByRole("button", { name: /^create item$/i }).click();

  const picker = page.locator("#newItem");
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect(picker.getByText("Login / Password", { exact: true }).last()).toBeVisible({
    timeout: 15_000,
  });
  // Favorites DnD wraps tiles — force-click the visible label.
  await picker.getByText("Login / Password", { exact: true }).last().click({ force: true });

  const dialog = page.locator("#newItem");
  await expect(dialog.getByRole("heading", { name: /new item.*login/i })).toBeVisible({
    timeout: 15_000,
  });

  const nameField = dialog.getByLabel(/item name/i);
  await fillAndAssert(nameField, input.title);

  const loginField = dialog.getByLabel(/^login$/i);
  await fillAndAssert(loginField, input.login);

  const passwordField = dialog.getByLabel(/^password$/i);
  await fillAndAssert(passwordField, input.password);

  const urlField = dialog.getByLabel(/^url$/i);
  await fillAndAssert(urlField, input.url);

  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: new RegExp(input.title, "i") }).first()).toBeVisible({
    timeout: 20_000,
  });
}
