import { expect, type Page } from "@playwright/test";

/**
 * If `#editItem` is open (e.g. personal-data bootstrap on a non-e2e build),
 * dismiss via Cancel → leave-without-saving Continue. CI builds set
 * VITE_E2E_DISABLE_PERSONAL_DATA_BOOTSTRAP=1 so this is usually a no-op.
 */
export async function dismissOpenItemDialog(page: Page): Promise<void> {
  const editItem = page.locator("#editItem");
  const appeared = await editItem
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
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

  await dialog.getByLabel(/item name/i).fill(input.title);

  // Key-form fields expose placeholder as accessible name, not the visible label text.
  await dialog.getByPlaceholder(/^enter login$/i).fill(input.login);
  await dialog.getByPlaceholder(/^enter password$/i).fill(input.password);
  await dialog.getByPlaceholder("https://example.com").fill(input.url);

  await dialog.getByRole("button", { name: /^save$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(input.title, { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
}
