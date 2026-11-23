import { expect, type Page } from "@playwright/test";

import { markE2eSmtpDeliverable } from "./db";
import { E2E_BASE_URL, E2E_MASTER_PASSWORD, E2E_SETUP_CODE } from "./env";
import { waitForMailpitOtp } from "./mailpit";

/** Public origin for invite/email links (CI uses PUBLIC_APP_BASE_URL=http://localhost:4173). */
function e2ePublicAppUrl(): string {
  return (process.env.PUBLIC_APP_BASE_URL ?? E2E_BASE_URL).trim().replace(/\/$/, "");
}

/** qa/web: empty-DB setup wizard → recovery export → full session unlock. */
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

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: /first-run setup/i })).toBeVisible({
    timeout: 30_000,
  });
  // Multi-cell setup code (TOTP-style): paste into the first cell so applyPaste fills all 16 hex digits.
  const setupCodeCell = page.locator("#setup-code");
  await expect(setupCodeCell).toBeVisible({ timeout: 30_000 });
  await setupCodeCell.focus();
  await setupCodeCell.evaluate((el, value) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", value);
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, E2E_SETUP_CODE);
  await expect(page.getByRole("button", { name: /^continue$/i })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Mail step — skip (mail activated later for OTP login of second users if needed).
  await expect(page.getByTestId("setup-mail-step")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /skip for now/i }).click();

  // Server address + registration mode (required for invite-link URLs).
  await expect(page.getByRole("heading", { name: /server address/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#setup-public-app-url").fill(e2ePublicAppUrl());
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Owner + workspace.
  await expect(page.getByRole("heading", { name: /owner and workspace/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#setup-owner-email").fill(input.email);
  await page.locator("#setup-first-name").fill(firstName);
  await page.locator("#setup-last-name").fill(lastName);
  await page.locator("#setup-workspace-name").fill("E2E Workspace");
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Master password.
  await expect(page.getByRole("heading", { name: /master password/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#setup-master-password").fill("short-pass");
  await page.locator("#setup-repeat-master-password").fill("short-pass");
  await expect(page.getByRole("button", { name: /^register$/i })).toBeDisabled();
  await page.locator("#setup-master-password").fill(masterPassword);
  await page.locator("#setup-repeat-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^register$/i }).click();

  await expect(page.getByRole("heading", { name: /save your recovery key/i })).toBeVisible({
    timeout: 90_000,
  });

  const finish = page.getByRole("button", { name: /finish setup/i });
  await expect(finish).toBeDisabled();

  const recoveryKey = (await page.locator("p.font-mono").first().innerText()).trim();
  expect(recoveryKey.length).toBeGreaterThan(16);

  await page.getByRole("button", { name: /^copy$/i }).click();
  await expect(finish).toBeEnabled({ timeout: 15_000 });
  await finish.click();

  // Full session + unlock in the same tab → items.
  await expect(page).toHaveURL(/\/items/, { timeout: 90_000 });
  await expectNoPersistedServerKeyShare(page);

  return { recoveryKey };
}

/** Email login + OTP from Mailpit (real SMTP path). Auto-submits on 6 digits. */
export async function signInWithEmailOtp(page: Page, email: string): Promise<void> {
  await markE2eSmtpDeliverable();
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

/**
 * Register a user after the catalog already has accounts (OTP path, not bootstrap).
 * Returns the recovery key shown on the save-recovery screen.
 */
export async function registerWithEmailOtpAndUnlock(
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

  await markE2eSmtpDeliverable();
  const sinceMs = Date.now();
  await page.goto("/auth/email");
  await page.locator("#auth-email").fill(input.email);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByLabel(/digit 1 of 6/i)).toBeVisible({ timeout: 30_000 });

  const otp = await waitForMailpitOtp(input.email, { sinceMs });
  for (let i = 0; i < 6; i += 1) {
    await page.getByLabel(new RegExp(`digit ${i + 1} of 6`, "i")).fill(otp[i]!);
  }

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

  // Registration bootstrap token is not a full session — complete email OTP, then unlock.
  await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible({
    timeout: 30_000,
  });
  await signInWithEmailOtp(page, input.email);
  await unlockWithMasterPassword(page, masterPassword);
  return { recoveryKey };
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
  await expectNoPersistedServerKeyShare(page);
}

/** Device storage may keep the device share. It must not keep the server share. */
export async function expectNoPersistedServerKeyShare(page: Page): Promise<void> {
  const raw = await page.evaluate(() => {
    const parts: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith("okkey.vault.bundle")) {
        parts.push(localStorage.getItem(key) ?? "");
      }
    }
    parts.push(sessionStorage.getItem("okkey.vault.bundle") ?? "");
    return parts.join("\n");
  });
  expect(raw.includes("server_key_share")).toBe(false);
}

/** Assert unlock rejects this master password and stays on the lock screen. */
export async function expectUnlockRejectsMasterPassword(
  page: Page,
  masterPassword: string,
): Promise<void> {
  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#unlock-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^unlock$/i }).click();
  await expect(page.getByText(/incorrect master password/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/lock/, { timeout: 10_000 });
}

/**
 * Complete email + OTP on the current page (or from email entry).
 * Does not navigate away first — used by extension PKCE auth tabs.
 */
export async function completeEmailOtpOnPage(page: Page, email: string): Promise<void> {
  const sinceMs = Date.now();
  const otpDigit = page.getByLabel(/digit 1 of 6/i);
  const emailField = page.locator("#auth-email");

  if (!(await otpDigit.isVisible().catch(() => false))) {
    await expect(emailField.or(otpDigit)).toBeVisible({ timeout: 60_000 });
    if (await emailField.isVisible().catch(() => false)) {
      await emailField.fill(email);
      await page.getByRole("button", { name: /^sign in$/i }).click();
    }
  }

  await expect(otpDigit).toBeVisible({ timeout: 30_000 });
  const otp = await waitForMailpitOtp(email, { sinceMs });
  for (let i = 0; i < 6; i += 1) {
    await page.getByLabel(new RegExp(`digit ${i + 1} of 6`, "i")).fill(otp[i]!);
  }
}

/**
 * Drop the tab unlock record so the next full navigation starts locked.
 * Hiding the page no longer locks the vault for a new account (sleep lock defaults off).
 */
export async function clearTabVaultUnlock(page: Page): Promise<void> {
  await page.evaluate(() => {
    sessionStorage.removeItem("okkey.vault.unlock.tab");
  });
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
