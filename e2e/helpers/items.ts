import { expect, type Page } from "@playwright/test";

/** Create a Login / Password item via the new-item popup (qa/web 7.1 subset). */
export async function createLoginItem(
  page: Page,
  input: { title: string; login: string; password: string; url: string },
): Promise<void> {
  // Sidebar also has a compact "Create item"; prefer the shell top bar.
  await page.getByTestId("items-shell-topbar").getByRole("button", { name: /^create item$/i }).click();

  // Favorites expose a sortable duplicate (aria-roledescription=sortable). Prefer the card tile.
  await page
    .locator('[role="button"]:not([aria-roledescription="sortable"])')
    .filter({ hasText: /login\s*\/\s*password/i })
    .first()
    .click({ timeout: 15_000 });

  await expect(page.getByRole("heading", { name: /new item/i })).toBeVisible({ timeout: 15_000 });

  const nameField = page.getByLabel(/item name/i);
  if (await nameField.count()) {
    await nameField.fill(input.title);
  }

  // Key-form field labels (en): login / password / website URL
  const login = page.getByLabel(/^login$/i).first();
  const password = page.getByLabel(/^password$/i).first();
  const url = page.getByLabel(/website url/i).first();
  await login.fill(input.login);
  await password.fill(input.password);
  await url.fill(input.url);

  // Title often auto-fills from URL; ensure explicit name if still empty.
  if (await nameField.count()) {
    const current = await nameField.inputValue();
    if (!current.trim()) {
      await nameField.fill(input.title);
    }
  }

  // Prefer the dialog/popup Save over any other Save on the page.
  await page.getByRole("button", { name: /^save$/i }).last().click();
  await expect(page.getByText(input.title, { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
}
