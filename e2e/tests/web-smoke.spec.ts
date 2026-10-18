import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
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
 * table (fresh CI Postgres) and API with AUTH_E2E_FIXED_CODE.
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
  await page.goto("/items");
  if (await page.getByRole("heading", { name: /vault is locked/i }).isVisible().catch(() => false)) {
    await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);
  }
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible({ timeout: 60_000 });

  await createLoginItem(page, {
    title: LOGIN_TITLE,
    login: LOGIN_USER,
    password: LOGIN_PASSWORD,
    url: LOGIN_URL,
  });

  await page.reload();
  if (await page.getByRole("heading", { name: /vault is locked/i }).isVisible().catch(() => false)) {
    await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);
  }
  await expect(page.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });

  await assertVaultBlobsHaveNoPlaintext([LOGIN_PASSWORD, E2E_MASTER_PASSWORD]);
});

test("3) second browser → device confirm → item decrypts", async () => {
  test.skip(!email, "registration did not run");

  await page.goto("/items");
  if (await page.getByRole("heading", { name: /vault is locked/i }).isVisible().catch(() => false)) {
    await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);
  }
  await expect(page.getByTestId("items-shell-topbar")).toBeVisible({ timeout: 60_000 });

  const second = await browserRef.newContext({ locale: "en-US" });
  const page2 = await second.newPage();
  try {
    await signInWithEmailOtp(page2, email);
    await expect(page2).toHaveURL(/device-pending|account\/lock|items/, { timeout: 60_000 });

    if (/device-pending/.test(page2.url())) {
      const trust = page.getByRole("button", { name: /^trust device$/i });
      await expect(trust).toBeVisible({ timeout: 60_000 });
      await trust.click();
      await expect(page2).toHaveURL(/account\/lock|items/, { timeout: 60_000 });
    }

    if (await page2.getByRole("heading", { name: /vault is locked/i }).isVisible().catch(() => false)) {
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
  await page.getByRole("link", { name: /forgot master password/i }).click();
  await expect(page.getByRole("heading", { name: /forgot master password/i })).toBeVisible({
    timeout: 30_000,
  });

  // Method select (when more than one recovery method is available).
  const methodSelect = page.locator("#restore-method");
  if (await methodSelect.isVisible().catch(() => false)) {
    await methodSelect.click();
    await page.getByRole("option", { name: /recovery key/i }).click();
  }

  await page.locator("#restore-recovery-key").fill(recoveryKey);
  await page.locator("#restore-new-password").fill(NEW_MASTER);
  await page.locator("#restore-repeat-password").fill(NEW_MASTER);
  await page.getByRole("button", { name: /^restore access$/i }).click();

  const newKeyHeading = page.getByRole("heading", { name: /save your new recovery key/i });
  if (await newKeyHeading.isVisible({ timeout: 30_000 }).catch(() => false)) {
    const cont = page.getByRole("button", { name: /^continue$/i });
    await expect(cont).toBeDisabled();
    await page.getByRole("button", { name: /^copy$/i }).click();
    await expect(cont).toBeEnabled({ timeout: 15_000 });
    await cont.click();
  }

  if (await page.getByRole("heading", { name: /vault is locked/i }).isVisible().catch(() => false)) {
    await unlockWithMasterPassword(page, NEW_MASTER);
  }

  await expect(page.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });
});
