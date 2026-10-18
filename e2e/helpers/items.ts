import { expect, type Page } from "@playwright/test";

/**
 * Personal-data bootstrap creates a list row and often opens `#editItem`.
 * Closing via the animated header Close button is flaky ("element is not stable")
 * and dirty prefill trips "Leave without saving?". Prefer Cancel → Continue, which
 * goes through the same router clear as the product close path.
 */
export async function dismissOpenItemDialog(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /personal data/i }).first()).toBeVisible({
    timeout: 30_000,
  });

  const editItem = page.locator("#editItem");
  if (!(await editItem.isVisible().catch(() => false))) {
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 5_000 });
    return;
  }

  await expect(editItem).toHaveAttribute("data-state", "open", { timeout: 10_000 });
  await editItem.getByRole("button", { name: /^cancel$/i }).click({ force: true });

  const leave = page.getByRole("heading", { name: /leave without saving/i });
  if (await leave.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^continue$/i }).click({ force: true });
    await expect(leave).toBeHidden({ timeout: 10_000 });
  } else {
    // Race: confirm may appear just after Cancel.
    try {
      await leave.waitFor({ state: "visible", timeout: 3_000 });
      await page.getByRole("button", { name: /^continue$/i }).click({ force: true });
      await expect(leave).toBeHidden({ timeout: 10_000 });
    } catch {
      // Form was not dirty — Cancel already cleared the popup.
    }
  }

  await expect(editItem).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/popup=editItem/i);
}

/** Create a Login / Password item via the new-item popup (qa/web 7.1 subset). */
export async function createLoginItem(
  page: Page,
  input: { title: string; login: string; password: string; url: string },
): Promise<void> {
  await dismissOpenItemDialog(page);

  // Sidebar also has a compact "Create item"; prefer the shell top bar.
  await page.getByTestId("items-shell-topbar").getByRole("button", { name: /^create item$/i }).click();

  const picker = page.locator("#newItem").or(page.getByRole("dialog"));
  await expect(picker.getByText("Login / Password", { exact: true }).last()).toBeVisible({
    timeout: 15_000,
  });
  // Favorites DnD wraps tiles — force-click the visible label.
  await picker.getByText("Login / Password", { exact: true }).last().click({ force: true });

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /new item.*login/i })).toBeVisible({
    timeout: 15_000,
  });

  const nameField = dialog.getByLabel(/item name/i);
  await nameField.fill(input.title);

  // Key-form field labels (en): login / password / website URL
  await dialog.getByLabel(/^login$/i).fill(input.login);
  await dialog.getByLabel(/^password$/i).fill(input.password);
  await dialog.getByLabel(/website url/i).fill(input.url);

  const current = await nameField.inputValue();
  if (!current.trim()) {
    await nameField.fill(input.title);
  }

  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(input.title, { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
}
