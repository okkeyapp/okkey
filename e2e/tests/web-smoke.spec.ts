import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  gotoItemsUnlocked,
  registerBootstrapAndUnlock,
  signInWithEmailOtp,
  unlockWithMasterPassword,
} from "../helpers/auth";
import { assertVaultBlobsHaveNoPlaintext } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { createLoginItem } from "../helpers/items";

/**
 * Minimal browser smoke covering qa/web scenarios from enterprise#110:
 * 1) registration → recovery key gate → unlock
 * 2) create Login item → visible after reload → ciphertext-only in DB
 * 3) second browser → device pending → trust → decrypt
 * 4) forgot master password → recovery key → new password → items readable
 *
 * Shared browser context keeps vault storage across steps. Needs empty users
 * table (fresh CI Postgres) and SMTP → Mailpit for OTP (no API createCode bypass).
 */
test.describe.configure({ mode: "serial" });

const LOGIN_PASSWORD = "PlaintextSecret-NeverOnServer-9f3a";
const LOGIN_USER = "alice@example.com";
const LOGIN_URL = "https://example.com/login";
const LOGIN_TITLE = "Example Login";
const NEW_MASTER = "e2e-master-pass-rotated";

let browserRef: Browser;
let context: BrowserContext;
let page: Page;
let email = "";
let recoveryKey = "";

test.beforeAll(async ({ browser }) => {
  browserRef = browser;
  context = await browser.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

test("1) bootstrap registration → recovery export → unlock", async () => {
  email = uniqueEmail("smoke");
  const result = await registerBootstrapAndUnlock(page, {
    email,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  recoveryKey = result.recoveryKey;
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible();
});

test("2) create Login item → reload → DB has no plaintext", async () => {
  test.skip(!email, "registration did not run");
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);

  await createLoginItem(page, {
    title: LOGIN_TITLE,
    login: LOGIN_USER,
    password: LOGIN_PASSWORD,
    url: LOGIN_URL,
  });

  await page.reload();
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await expect(page.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });

  await assertVaultBlobsHaveNoPlaintext([LOGIN_PASSWORD, E2E_MASTER_PASSWORD]);
});

test("3) second browser → device confirm → item decrypts", async () => {
  test.skip(!email, "registration did not run");

  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);

  // Device fingerprints are derived from UA (`web_app-{browser}-{os}-…`). A second
  // Chromium context with the default Playwright UA shares the primary fingerprint
  // and is treated as already trusted (skips /account/device-pending → lock).
  const second = await browserRef.newContext({
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  });
  const page2 = await second.newPage();
  try {
    await signInWithEmailOtp(page2, email);
    await expect(page2).toHaveURL(/\/account\/device-pending/, { timeout: 60_000 });

    const trust = page.getByRole("button", { name: /^trust device$/i });
    await expect(trust).toBeVisible({ timeout: 60_000 });
    await trust.click();
    await expect(page2).toHaveURL(/\/account\/lock|\/items/, { timeout: 60_000 });

    const lock2 = page2.getByRole("heading", { name: /vault is locked/i });
    const topbar2 = page2.getByTestId("items-shell-topbar");
    await expect(lock2.or(topbar2)).toBeVisible({ timeout: 60_000 });
    if (await lock2.isVisible().catch(() => false)) {
      await unlockWithMasterPassword(page2, E2E_MASTER_PASSWORD);
    }

    await expect(page2.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await second.close();
  }
});

test("4) recovery key → new master password → items readable", async () => {
  test.skip(!email || !recoveryKey, "registration did not run");

  await page.goto("/account/lock");
  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: /forgot master password/i }).click();
  await expect(page.getByRole("heading", { name: /forgot master password/i })).toBeVisible({
    timeout: 30_000,
  });

  // Wait for recovery status to finish loading, then choose key when a chooser exists.
  await expect(page.locator("#restore-method")).toBeVisible({ timeout: 30_000 });
  // If key fields are not yet shown, open the select and pick Recovery key.
  if (!(await page.locator("#restore-recovery-key").isVisible().catch(() => false))) {
    await page.locator("#restore-method").click();
    await page.getByRole("option", { name: /recovery key/i }).click();
  }
  await expect(page.locator("#restore-recovery-key")).toBeVisible({ timeout: 15_000 });

  await page.locator("#restore-recovery-key").fill(recoveryKey);
  await page.locator("#restore-new-password").fill(NEW_MASTER);
  await page.locator("#restore-repeat-password").fill(NEW_MASTER);
  await page.getByRole("button", { name: /^restore access$/i }).click();

  const newKeyHeading = page.getByRole("heading", { name: /save your new recovery key/i });
  await expect(newKeyHeading).toBeVisible({ timeout: 60_000 });
  const cont = page.getByRole("button", { name: /^continue$/i });
  await expect(cont).toBeDisabled();
  await page.getByRole("button", { name: /^copy$/i }).click();
  await expect(cont).toBeEnabled({ timeout: 15_000 });
  await cont.click();

  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 30_000,
  });
  await unlockWithMasterPassword(page, NEW_MASTER);

  await expect(page.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });
});
