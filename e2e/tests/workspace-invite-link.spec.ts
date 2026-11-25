import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  gotoItemsUnlocked,
  registerBootstrapAndUnlock,
  registerViaInviteLinkAndUnlock,
} from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { dismissOpenItemDialog } from "../helpers/items";

/**
 * TSK-254: workspace invite-by-link (no email) — create, one-click copy, accept, revoke.
 * Tokens are generated at runtime by the API; nothing secret is hardcoded here.
 */
test.describe.configure({ mode: "serial" });

let browserRef: Browser;
let ownerContext: BrowserContext;
let ownerPage: Page;
let ownerEmail = "";
let inviteUrl = "";
let revokedInviteUrl = "";

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
  await gotoItemsUnlocked(page, E2E_MASTER_PASSWORD);
  await dismissOpenItemDialog(page);
  await page.goto("/settings/members");
  await expect(page.getByRole("heading", { name: /workspace members|members/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  // Empty state uses aria-label "Invite"; list footer uses "Invite members".
  const inviteControl = page
    .getByRole("button", { name: /^invite$/i })
    .or(page.getByRole("button", { name: /invite members/i }));
  await expect(inviteControl.first()).toBeVisible({ timeout: 15_000 });
  await inviteControl.first().click();
  await expect(page.getByTestId("invite-mode-link")).toBeVisible({ timeout: 15_000 });
}

test("1) owner creates an invite link and copies it in one click", async () => {
  test.setTimeout(240_000);
  ownerEmail = uniqueEmail("invite-owner");
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
  const copied = await ownerPage.evaluate(async () => navigator.clipboard.readText());
  expect(copied).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);
  inviteUrl = copied;

  await ownerPage.getByRole("button", { name: /^done$/i }).click();
});

test("2) invitee registers through the link without a matching invite email", async () => {
  test.skip(!inviteUrl, "invite link was not created");
  test.setTimeout(240_000);

  const inviteeContext = await browserRef.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const inviteePage = await inviteeContext.newPage();
  try {
    await registerViaInviteLinkAndUnlock(inviteePage, {
      inviteUrl,
      email: uniqueEmail("invite-guest"),
      masterPassword: E2E_MASTER_PASSWORD,
      firstName: "Guest",
      lastName: "Invitee",
    });
    await dismissOpenItemDialog(inviteePage);
    await expect(inviteePage.getByTestId("items-shell-topbar")).toBeVisible({
      timeout: 90_000,
    });
  } finally {
    await inviteeContext.close();
  }
});

test("3) revoked invite link no longer works", async () => {
  test.skip(!ownerEmail, "owner registration did not run");
  test.setTimeout(240_000);

  await openMembersInvitePopup(ownerPage);
  await ownerPage.getByTestId("invite-mode-link").click();
  await ownerPage.getByRole("button", { name: /create invite links/i }).click();
  await expect(ownerPage.getByTestId("invite-link-results")).toBeVisible({ timeout: 30_000 });
  revokedInviteUrl = await ownerPage.evaluate(async () => navigator.clipboard.readText());
  expect(revokedInviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);
  await ownerPage.getByRole("button", { name: /^done$/i }).click();

  // Open the pending invite card (link invites show the localized label).
  await ownerPage.getByText(/^invite link$/i).first().click();
  await expect(ownerPage.getByTestId("invite-pending-actions")).toBeVisible();
  await ownerPage.getByRole("button", { name: /^actions$/i }).click();
  await ownerPage.getByRole("menuitem", { name: /delete invitation/i }).click();
  await expect(ownerPage.getByRole("heading", { name: /delete invitation/i })).toBeVisible();
  await ownerPage.getByRole("button", { name: /^delete$/i }).click();
  await expect(ownerPage.getByText(/invitation revoked/i)).toBeVisible({ timeout: 30_000 });

  const guestContext = await browserRef.newContext({ locale: "en-US" });
  const guestPage = await guestContext.newPage();
  try {
    await guestPage.goto(revokedInviteUrl);
    await expect(guestPage.getByText(/revoked|invalid|expired/i)).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await guestPage.close();
    await guestContext.close();
  }
});

test("4) email invite mode still works alongside links", async () => {
  test.skip(!ownerEmail, "owner registration did not run");
  test.setTimeout(180_000);

  await openMembersInvitePopup(ownerPage);
  await expect(ownerPage.getByTestId("invite-mode-email")).toBeVisible();
  await ownerPage.getByTestId("invite-mode-email").click();

  const inviteeEmail = uniqueEmail("invite-mail");
  await ownerPage.getByPlaceholder(/enter member email/i).fill(inviteeEmail);
  await ownerPage.getByRole("button", { name: /send invitations/i }).click();
  await expect(ownerPage.getByText(inviteeEmail)).toBeVisible({ timeout: 30_000 });
});
