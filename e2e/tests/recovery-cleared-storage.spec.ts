import { expect, test, type Browser, type Page } from "@playwright/test";

import { registerBootstrapAndUnlock, signInWithEmailOtp } from "../helpers/auth";
import { clearRecoveryPossessionPublicKey } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";

/**
 * Cleared storage keeps the same UA fingerprint, so the session has no device.
 * Restore must register that browser before proving the recovery key.
 * A legacy wrap (no possession public key) must explain that a trusted device
 * has to rotate the key — not a generic "check the key" error.
 */
test.describe.configure({ mode: "serial" });

const ROTATED_MASTER = "e2e-cleared-storage-rotated";
const SECOND_MASTER = "e2e-cleared-storage-rotated-2";
const LEGACY_MESSAGE = /rotate the recovery key in Settings/i;
const GENERIC_KEY_ERROR = /Check the key and try again/i;

let browserRef: Browser;
let email = "";
let recoveryKey = "";

test.beforeAll(async ({ browser }) => {
  browserRef = browser;
});

async function freshPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browserRef.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

async function openRecoveryKeyForm(page: Page, accountEmail: string): Promise<void> {
  await signInWithEmailOtp(page, accountEmail);
  const restoreLink = page.getByRole("link", { name: /restore with recovery key/i });
  const heading = page.getByRole("heading", { name: /forgot master password/i });
  const forgot = page.getByRole("link", { name: /forgot master password/i });
  await expect(restoreLink.or(heading).or(forgot)).toBeVisible({ timeout: 60_000 });
  if (await restoreLink.isVisible().catch(() => false)) {
    await restoreLink.click();
  } else if (!(await heading.isVisible().catch(() => false))) {
    await forgot.click();
  }
  await expect(page.getByRole("heading", { name: /forgot master password/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("#restore-method")).toBeVisible({ timeout: 30_000 });
  if (!(await page.locator("#restore-recovery-key").isVisible().catch(() => false))) {
    await page.locator("#restore-method").click();
    await page.getByRole("option", { name: /recovery key/i }).click();
  }
  await expect(page.locator("#restore-recovery-key")).toBeVisible({ timeout: 15_000 });
}

async function submitRecoveryKey(
  page: Page,
  key: string,
  newPassword: string,
): Promise<void> {
  await page.locator("#restore-recovery-key").fill(key);
  await page.locator("#restore-new-password").fill(newPassword);
  await page.locator("#restore-repeat-password").fill(newPassword);
  await page.getByRole("button", { name: /^restore access$/i }).click();
}

test("register a vault and keep the recovery key", async () => {
  const { page, close } = await freshPage();
  try {
    email = uniqueEmail("cleared-storage");
    const result = await registerBootstrapAndUnlock(page, {
      email,
      masterPassword: E2E_MASTER_PASSWORD,
    });
    recoveryKey = result.recoveryKey;
    await expect(page.getByTestId("items-shell-topbar")).toBeVisible();
  } finally {
    await close();
  }
});

test("fresh recovery key restores after storage is cleared", async () => {
  test.skip(!email || !recoveryKey, "registration did not run");
  const { page, close } = await freshPage();
  try {
    await openRecoveryKeyForm(page, email);
    await submitRecoveryKey(page, recoveryKey, ROTATED_MASTER);
    const newKeyHeading = page.getByRole("heading", { name: /save your new recovery key/i });
    await expect(newKeyHeading).toBeVisible({ timeout: 90_000 });
    recoveryKey = (await page.locator("p.font-mono").first().innerText()).trim();
    expect(recoveryKey.length).toBeGreaterThan(16);
  } finally {
    await close();
  }
});

test("rotated recovery key restores after storage is cleared again", async () => {
  test.skip(!email || !recoveryKey, "rotated key was not captured");
  const { page, close } = await freshPage();
  try {
    await openRecoveryKeyForm(page, email);
    await submitRecoveryKey(page, recoveryKey, SECOND_MASTER);
    await expect(page.getByRole("heading", { name: /save your new recovery key/i })).toBeVisible({
      timeout: 90_000,
    });
    recoveryKey = (await page.locator("p.font-mono").first().innerText()).trim();
    expect(recoveryKey.length).toBeGreaterThan(16);
  } finally {
    await close();
  }
});

test("legacy recovery key tells the user to rotate it on a trusted device", async () => {
  test.skip(!email, "registration did not run");
  await clearRecoveryPossessionPublicKey(email);
  const { page, close } = await freshPage();
  try {
    await openRecoveryKeyForm(page, email);
    await submitRecoveryKey(page, recoveryKey || "not-the-point", SECOND_MASTER);
    await expect(page.getByText(LEGACY_MESSAGE)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(GENERIC_KEY_ERROR)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /save your new recovery key/i })).toHaveCount(0);
  } finally {
    await close();
  }
});
