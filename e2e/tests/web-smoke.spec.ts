import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  clearTabVaultUnlock,
  expectUnlockRejectsMasterPassword,
  gotoItemsUnlocked,
  registerBootstrapAndUnlock,
  signInWithEmailOtp,
  unlockWithMasterPassword,
} from "../helpers/auth";
import { assertVaultBlobsHaveNoPlaintext, resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { extensionBuildReady, extensionPkceSignInUnlockAndSeeItem } from "../helpers/extension";
import { createLoginItem } from "../helpers/items";

/**
 * Minimal browser smoke for the password-manager chain:
 * 1) registration → recovery key gate → unlock
 * 2) create Login item → visible after reload → ciphertext-only in DB
 * 3) second browser → device pending → trust → decrypt
 * 4) forgot master password → recovery key → new password proves old rejected
 * 5) Chromium extension PKCE → trust → unlock → item visible
 *
 * Shared browser context keeps vault storage across steps inside this file.
 * beforeAll clears users and the e2e Redis DB so bootstrap registration does not
 * depend on another spec. SMTP → Mailpit supplies OTP (no API createCode bypass).
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
  await resetE2eCatalog();
  browserRef = browser;
  context = await browser.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await resetE2eCatalog();
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

  // Device fingerprints are derived from the user agent plus a per-profile install id.
  // A second Chromium context with the same user agent is a different device.
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

test("3b) same user agent second profile → reject, then block", async () => {
  test.skip(!email, "registration did not run");

  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  const sameProfile = await browserRef.newContext({ locale: "en-US" });
  const page2 = await sameProfile.newPage();
  try {
    await signInWithEmailOtp(page2, email);
    await expect(page2).toHaveURL(/\/account\/device-pending/, { timeout: 60_000 });
    await expect(page2.getByText(/no longer has its device signing key/i)).toHaveCount(0);
    await expect(page2.getByRole("heading", { name: /confirm this device/i })).toBeVisible({
      timeout: 30_000,
    });

    const notNow = page.getByRole("button", { name: /^not now$/i });
    await expect(notNow).toBeVisible({ timeout: 60_000 });
    await notNow.click();
    await expect(page2.getByRole("heading", { name: /this device was denied/i })).toBeVisible({
      timeout: 60_000,
    });

    await page2.getByRole("button", { name: /request approval again/i }).click();
    await expect(page2.getByRole("heading", { name: /confirm this device/i })).toBeVisible({
      timeout: 60_000,
    });
    // After reject→retry the session must rebind so trusted approvers and passkey
    // options are available again (not the empty "no trusted devices" state).
    await expect(
      page2.getByText(/no trusted devices are available yet/i),
    ).toHaveCount(0);
    await expect(notNow).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /block options/i }).click();
    await page.getByRole("menuitem", { name: /block forever/i }).click();
    await expect(page2.getByRole("heading", { name: /this device is blocked/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page2.getByText(/blocked until/i)).toHaveCount(0);
    await expect(page2.getByText(/blocked permanently/i)).toBeVisible();
  } finally {
    await sameProfile.close();
  }
});

test("3c) reject → request again → trust → unlock with master password", async () => {
  test.skip(!email, "registration did not run");

  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  const third = await browserRef.newContext({
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  });
  const page3 = await third.newPage();
  try {
    await signInWithEmailOtp(page3, email);
    await expect(page3).toHaveURL(/\/account\/device-pending/, { timeout: 60_000 });
    await expect(page3.getByRole("heading", { name: /confirm this device/i })).toBeVisible({
      timeout: 30_000,
    });

    const notNow = page.getByRole("button", { name: /^not now$/i });
    await expect(notNow).toBeVisible({ timeout: 60_000 });
    await notNow.click();
    await expect(page3.getByRole("heading", { name: /this device was denied/i })).toBeVisible({
      timeout: 60_000,
    });

    await page3.getByRole("button", { name: /request approval again/i }).click();
    await expect(page3.getByRole("heading", { name: /confirm this device/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page3.getByText(/no trusted devices are available yet/i),
    ).toHaveCount(0);

    const trust = page.getByRole("button", { name: /^trust device$/i });
    await expect(trust).toBeVisible({ timeout: 60_000 });
    await trust.click();
    await expect(page3).toHaveURL(/\/account\/lock|\/items/, { timeout: 60_000 });

    const lock3 = page3.getByRole("heading", { name: /vault is locked/i });
    const topbar3 = page3.getByTestId("items-shell-topbar");
    await expect(lock3.or(topbar3)).toBeVisible({ timeout: 60_000 });
    if (await lock3.isVisible().catch(() => false)) {
      await unlockWithMasterPassword(page3, E2E_MASTER_PASSWORD);
    }
    await expect(page3.getByTestId("items-shell-topbar")).toBeVisible({ timeout: 60_000 });
    await expect(page3.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
      timeout: 60_000,
    });
  } finally {
    await third.close();
  }
});

test("4) recovery key → new master password → old rejected, new unlocks", async () => {
  test.skip(!email || !recoveryKey, "registration did not run");

  await clearTabVaultUnlock(page);
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
  await page.locator("#restore-new-password").fill("short-pass");
  await page.locator("#restore-repeat-password").fill("short-pass");
  await expect(page.getByRole("button", { name: /^restore access$/i })).toBeDisabled();
  await expect(page.getByText(/at least 12 characters/i)).toBeVisible();
  await page.locator("#restore-new-password").fill(NEW_MASTER);
  await page.locator("#restore-repeat-password").fill(NEW_MASTER);
  await page.getByRole("button", { name: /^restore access$/i }).click();

  const newKeyHeading = page.getByRole("heading", { name: /save your new recovery key/i });
  await expect(newKeyHeading).toBeVisible({ timeout: 60_000 });
  const cont = page.getByRole("button", { name: /^continue$/i });
  await expect(cont).toBeDisabled();
  await page.getByRole("button", { name: /^copy$/i }).click();
  // Continue stays disabled until ack-export settles (not just clipboard write).
  await expect(cont).toBeEnabled({ timeout: 30_000 });
  await cont.click();
  await expect(newKeyHeading).toBeHidden({ timeout: 30_000 });

  // After recovery the app may land unlocked on /items or on lock. Force lock and
  // prove rotation: old master password is rejected; new password unlocks and decrypts.
  await clearTabVaultUnlock(page);
  await page.goto("/account/lock");
  await expect(page.getByRole("heading", { name: /vault is locked/i })).toBeVisible({
    timeout: 60_000,
  });
  await expectUnlockRejectsMasterPassword(page, E2E_MASTER_PASSWORD);
  await unlockWithMasterPassword(page, NEW_MASTER);

  await expect(page.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });

  await page.reload();
  await gotoItemsUnlocked(page, NEW_MASTER);
  await expect(page.getByText(LOGIN_TITLE, { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });
});

test("5) extension PKCE → trust → unlock → item visible", async () => {
  test.skip(
    process.env.E2E_EXTENSION !== "1" || !extensionBuildReady(),
    "set E2E_EXTENSION=1 and run yarn build:extension:chromium",
  );
  test.skip(!email, "registration did not run");

  // Primary web session must stay unlocked so Trust device can approve the extension.
  await gotoItemsUnlocked(page, NEW_MASTER);

  await extensionPkceSignInUnlockAndSeeItem({
    trustPage: page,
    email,
    masterPassword: NEW_MASTER,
    itemTitle: LOGIN_TITLE,
  });
});
