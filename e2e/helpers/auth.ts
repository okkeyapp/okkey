import { expect, type Page } from "@playwright/test";

import { E2E_MASTER_PASSWORD } from "./env";
import { waitForMailpitOtp } from "./mailpit";

/** qa/web 3.1–3.6 + 4.5: empty-DB bootstrap → recovery export → unlock. */
export async function registerBootstrapAndUnlock(
  page: Page,
  input: {
    email: string;
    masterPassword?: string;
    firstName?: string;
    lastName?: string;
  },
): Promise<{ recoveryKey: string }> {
  const masterPassword = input.masterPassword ?? E2E_MASTER_PASSWORD;
  const firstName = input.firstName ?? "E2E";
  const lastName = input.lastName ?? "User";

  await page.goto("/auth/email");
  await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible();
  await page.locator("#auth-email").fill(input.email);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page.getByRole("heading", { name: /register with okkey/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#auth-reg-first-name").fill(firstName);
  await page.locator("#auth-reg-last-name").fill(lastName);
  await page.locator("#auth-reg-master-password").fill(masterPassword);
  await page.locator("#auth-reg-repeat-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^register$/i }).click();

  await expect(page.getByRole("heading", { name: /save your recovery key/i })).toBeVisible({
    timeout: 90_000,
  });

  const next = page.getByRole("button", { name: /^continue$/i });
  await expect(next).toBeDisabled();

  const recoveryKey = (await page.locator("p.font-mono").first().innerText()).trim();
  expect(recoveryKey.length).toBeGreaterThan(16);

  await page.getByRole("button", { name: /^copy$/i }).click();
  await expect(next).toBeEnabled({ timeout: 15_000 });
  await next.click();

  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#unlock-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^unlock$/i }).click();

  await expect(page).toHaveURL(/\/items/, { timeout: 60_000 });
  return { recoveryKey };
}

/** Email login + OTP from Mailpit (real SMTP path). Auto-submits on 6 digits. */
export async function signInWithEmailOtp(page: Page, email: string): Promise<void> {
  const sinceMs = Date.now();
  await page.goto("/auth/email");
  await page.locator("#auth-email").fill(email);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByLabel(/digit 1 of 6/i)).toBeVisible({ timeout: 30_000 });

  const otp = await waitForMailpitOtp(email, { sinceMs });
  for (let i = 0; i < 6; i += 1) {
    await page.getByLabel(new RegExp(`digit ${i + 1} of 6`, "i")).fill(otp[i]!);
  }
}

export async function unlockWithMasterPassword(
  page: Page,
  masterPassword = E2E_MASTER_PASSWORD,
): Promise<void> {
  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#unlock-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^unlock$/i }).click();
  await expect(page).toHaveURL(/\/items/, { timeout: 60_000 });
}

/**
 * Full navigation to /items reloads the SPA — vault session is locked again.
 * Wait for either lock or items shell (avoid racing isVisible on a still-loading page).
 */
export async function gotoItemsUnlocked(
  page: Page,
  masterPassword = E2E_MASTER_PASSWORD,
): Promise<void> {
  await page.goto("/items");
  const lock = page.getByRole("heading", { name: /vault is locked/i });
  const topbar = page.getByTestId("items-shell-topbar");
  await expect(lock.or(topbar)).toBeVisible({ timeout: 60_000 });
  if (await lock.isVisible().catch(() => false)) {
    await unlockWithMasterPassword(page, masterPassword);
  }
  await expect(topbar).toBeVisible({ timeout: 60_000 });
}
