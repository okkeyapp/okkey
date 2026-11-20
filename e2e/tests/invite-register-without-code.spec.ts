import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  registerBootstrapAndUnlock,
  signInWithEmailOtp,
  unlockWithMasterPassword,
} from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { dismissOpenItemDialog } from "../helpers/items";

/**
 * TSK-315: registering via a valid invite link skips the emailed verification code.
 * Ordinary registration (no invite) still requires OTP — covered by other e2e suites.
 */
test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let ownerContext: BrowserContext;
let ownerPage: Page;
let inviteUrl = "";

test.beforeAll(async ({ browser }) => {
  await resetE2eCatalog();
  browserRef = browser;
  ownerContext = await browser.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  ownerPage = await ownerContext.newPage();
});

test.afterAll(async () => {
  await ownerContext?.close();
  await resetE2eCatalog();
});

async function openMembersInvitePopup(page: Page): Promise<void> {
  await page.goto("/settings/members");
  await expect(page.getByRole("heading", { name: /workspace members|members/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  const inviteControl = page
    .getByRole("button", { name: /^invite$/i })
    .or(page.getByRole("button", { name: /invite members/i }));
  await expect(inviteControl.first()).toBeVisible({ timeout: 15_000 });
  await inviteControl.first().click();
  await expect(page.getByTestId("invite-mode-link")).toBeVisible({ timeout: 15_000 });
}

test("1) owner creates an invite link", async () => {
  test.setTimeout(240_000);
  const ownerEmail = uniqueEmail("invite-reg-owner");
  await registerBootstrapAndUnlock(ownerPage, {
    email: ownerEmail,
    masterPassword: E2E_MASTER_PASSWORD,
  });
  await expect(ownerPage.getByTestId("items-shell-topbar")).toBeVisible();
  await dismissOpenItemDialog(ownerPage);

  await openMembersInvitePopup(ownerPage);
  await ownerPage.getByTestId("invite-mode-link").click();
  await ownerPage.getByRole("button", { name: /create invite links/i }).click();
  await expect(ownerPage.getByTestId("invite-link-results")).toBeVisible({ timeout: 30_000 });
  inviteUrl = await ownerPage.evaluate(async () => navigator.clipboard.readText());
  expect(inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);
  await ownerPage.getByRole("button", { name: /^done$/i }).click();
});

test("2) invitee registers from the link without entering an email code", async () => {
  test.skip(!inviteUrl, "invite link was not created");
  test.setTimeout(240_000);

  const inviteeContext = await browserRef.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await inviteeContext.newPage();
  try {
    const inviteeEmail = uniqueEmail("invite-reg-guest");
    await page.goto(inviteUrl);
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("#auth-email").fill(inviteeEmail);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // Valid invite → registration without OTP digits.
    await expect(page.getByRole("heading", { name: /register with okkey/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel(/digit 1 of 6/i)).toHaveCount(0);

    await page.locator("#auth-reg-first-name").fill("Invite");
    await page.locator("#auth-reg-last-name").fill("Guest");
    await page.locator("#auth-reg-master-password").fill(E2E_MASTER_PASSWORD);
    await page.locator("#auth-reg-repeat-master-password").fill(E2E_MASTER_PASSWORD);
    await page.getByRole("button", { name: /^register$/i }).click();

    await expect(page.getByRole("heading", { name: /save your recovery key/i })).toBeVisible({
      timeout: 90_000,
    });
    const next = page.getByRole("button", { name: /^continue$/i });
    await expect(next).toBeDisabled();
    await page.getByRole("button", { name: /^copy$/i }).click();
    await expect(next).toBeEnabled({ timeout: 15_000 });
    await next.click();

    // Full session still needs email OTP after recovery (existing login path).
    await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible({
      timeout: 30_000,
    });
    await signInWithEmailOtp(page, inviteeEmail);
    await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);

    // Invite was consumed during registration; open the workspace from the landing page.
    await expect(page.getByRole("button", { name: /open workspace/i })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("button", { name: /open workspace/i }).click();
    await expect(page.getByTestId("items-shell-topbar")).toBeVisible({ timeout: 90_000 });
  } finally {
    await inviteeContext.close();
  }
});
