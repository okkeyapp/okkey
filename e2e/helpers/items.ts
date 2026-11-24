import { expect, type Locator, type Page } from "@playwright/test";

/**
 * After first unlock, personal-data bootstrap creates a row and may open `#editItem`
 * asynchronously. Wait until that settles, then dismiss via Cancel → leave-without-saving
 * Continue so Login create is not raced by a late-opening edit dialog.
 */
export async function dismissOpenItemDialog(page: Page): Promise<void> {
  const editItem = page.locator("#editItem");
  const personalDataRow = page.getByRole("button", { name: /personal data/i }).first();

  // Bootstrap create+navigate can take several seconds. Wait until either signal
  // appears — do not use locator.or().toBeVisible() (strict mode fails when both exist).
  await expect
    .poll(
      async () => {
        if (await editItem.isVisible().catch(() => false)) {
          return "edit";
        }
        if (await personalDataRow.isVisible().catch(() => false)) {
          return "row";
        }
        return "";
      },
      { timeout: 30_000 },
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
  // Let the one-shot title autofocus settle before driving fills (avoids focus races).
  await expect(nameField).toBeVisible();
  await nameField.click();
  await fillAndAssert(nameField, input.title);

  // Key-form fields expose placeholder as accessible name, not the visible label text.
  const loginField = dialog.getByPlaceholder(/^enter login$/i);
  const passwordField = dialog.getByPlaceholder(/^enter password$/i);
  const urlField = dialog.getByPlaceholder("https://example.com");

  await fillAndAssert(loginField, input.login);
  // Title must stay the explicit title — not the login email (autofill/focus flake).
  await expect(nameField).toHaveValue(input.title);

  await fillAndAssert(passwordField, input.password);
  await fillAndAssert(urlField, input.url);
  await expect(nameField).toHaveValue(input.title);
  await expect(loginField).toHaveValue(input.login);

  const save = dialog.getByRole("button", { name: /^save$/i });
  await expect(save).toBeEnabled({ timeout: 15_000 });
  await save.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(input.title, { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
}
