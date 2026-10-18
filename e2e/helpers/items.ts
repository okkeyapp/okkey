import { expect, type Page } from "@playwright/test";

/**
 * After unlock, personal-data bootstrap creates a list row and may open Edit record.
 * Wait for the list row (bootstrap settled), then dismiss any open dialogs —
 * including the "Leave without saving?" confirm that dirty forms show on Close.
 */
export async function dismissOpenItemDialog(page: Page): Promise<void> {
  // Prefer the list row: it appears once bootstrap has created the item.
  // Do not use locator.or(...).toBeVisible() — both can be visible (strict mode).
  await expect(page.getByRole("button", { name: /personal data/i }).first()).toBeVisible({
    timeout: 30_000,
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const leaveHeading = page.getByRole("heading", { name: /leave without saving/i });
    if (await leaveHeading.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /^continue$/i }).click();
      await expect(leaveHeading).toBeHidden({ timeout: 10_000 });
      continue;
    }

    const dialog = page.getByRole("dialog").first();
    if (!(await dialog.isVisible().catch(() => false))) {
      break;
    }

    const close = dialog.getByRole("button", { name: /^close$/i });
    if (await close.isVisible().catch(() => false)) {
      await close.click();
    } else {
      await page.keyboard.press("Escape");
    }
  }

  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
}

/** Create a Login / Password item via the new-item popup (qa/web 7.1 subset). */
export async function createLoginItem(
  page: Page,
  input: { title: string; login: string; password: string; url: string },
): Promise<void> {
  await dismissOpenItemDialog(page);

  // Sidebar also has a compact "Create item"; prefer the shell top bar.
  await page.getByTestId("items-shell-topbar").getByRole("button", { name: /^create item$/i }).click();

  const picker = page.getByRole("dialog");
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
