import { expect, type Page } from "@playwright/test";

/** Dismiss leftover item dialogs (e.g. personal-data bootstrap edit). */
export async function dismissOpenItemDialog(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) {
    return;
  }
  const close = dialog.getByRole("button", { name: /^close$/i });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

/** Create a Login / Password item via the new-item popup (qa/web 7.1 subset). */
export async function createLoginItem(
  page: Page,
  input: { title: string; login: string; password: string; url: string },
): Promise<void> {
  await dismissOpenItemDialog(page);

  // Sidebar also has a compact "Create item"; prefer the shell top bar.
  await page.getByTestId("items-shell-topbar").getByRole("button", { name: /^create item$/i }).click();

  // Category chooser: favorites DnD wraps tiles — click visible label with force.
  await page.getByText("Login / Password", { exact: true }).last().click({ force: true, timeout: 15_000 });

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
