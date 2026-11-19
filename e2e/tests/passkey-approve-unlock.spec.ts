import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  clearTabVaultUnlock,
  registerBootstrapAndUnlock,
  signInWithEmailOtp,
  unlockWithMasterPassword,
} from "../helpers/auth";
import { resetE2eCatalog } from "../helpers/db";
import { E2E_MASTER_PASSWORD, uniqueEmail } from "../helpers/env";
import { dismissOpenItemDialog } from "../helpers/items";
import {
  clearPendingShareWrapRecord,
  exportShareWrapRecords,
  importShareWrapRecords,
  listShareWrapIds,
  type ShareWrapRecord,
} from "../helpers/share-wrap-idb";
import {
  attachVirtualPasskey,
  detachVirtualPasskey,
  type VirtualPasskey,
} from "../helpers/webauthn";

/**
 * TSK-158: after passkey device approval, the new device must unlock with the
 * master password. Reproduces the staging failure Saša hit on d3v @ 5f70ac57.
 *
 * Chromium's CDP credential export does not carry PRF/hmac-secret material, so
 * this flow uses one browser profile: enroll+wrap on the trusted install, wipe
 * all local state, then email-OTP sign-in again (new pending device + session
 * bound to it) and self-approve with the same virtual passkey.
 *
 * The second test forces the stale IndexedDB `"pending"` wrap-key row scenario
 * that fails without promote-on-load: reinject wrap material only under
 * `"pending"`, approve, then delete `"pending"` so unlock must use the
 * promoted user-scoped row.
 */
test.describe.configure({ mode: "serial" });

let browserRef: Browser;
const pageConsole: string[] = [];

async function openSignInMethods(page: Page): Promise<void> {
  await dismissOpenItemDialog(page);
  const accountTrigger = page.getByRole("button", { name: /e2e user .+@okkey\.local/i });
  await expect(accountTrigger).toBeVisible({ timeout: 30_000 });
  await accountTrigger.click();
  await page.getByRole("menuitem", { name: /my settings/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: /sign-in methods/i }).click();
  await expect(dialog.getByRole("heading", { name: /sign-in methods/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function enrollPasskeyAndAllowApprove(page: Page): Promise<void> {
  await openSignInMethods(page);
  const dialog = page.getByRole("dialog");
  const add = dialog.getByRole("button", { name: /^add$/i }).first();
  await expect(add).toBeVisible({ timeout: 30_000 });
  await add.click();
  const allow = dialog.getByRole("button", {
    name: /allow this passkey to approve new devices/i,
  });
  const ready = dialog.getByText(/this passkey can approve a new device/i);
  await expect(allow.or(ready)).toBeVisible({ timeout: 90_000 });
  if (await allow.isVisible().catch(() => false)) {
    await allow.click();
    await expect(ready).toBeVisible({ timeout: 90_000 });
  }
  await dialog.getByRole("button", { name: /^close$/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** Full local wipe so the next OTP login registers a new pending fingerprint. */
async function wipeLocalBrowserProfile(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    const dbNames = ["okkey.share-wrap", "okkey.device-signing", "okkey.device-keys"];
    await Promise.all(
      dbNames.map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          }),
      ),
    );
  });
}

async function dumpUnlockDiagnostics(page: Page, label: string): Promise<void> {
  const diag = await page.evaluate(async () => {
    const bundles: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("okkey.vault.bundle")) {
        continue;
      }
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
        bundles[key] = {
          has_device_share: Boolean(String(parsed.device_share_b64 ?? "").trim()),
          device_share_len: String(parsed.device_share_b64 ?? "").length,
          has_salt: Boolean(String(parsed.password_kdf_salt_b64 ?? "").trim()),
          has_enc_priv: Boolean(
            (parsed.encrypted_private_key as { payload?: string } | undefined)?.payload,
          ),
          has_server_share: Boolean(String(parsed.server_key_share_b64 ?? "").trim()),
        };
      } catch {
        bundles[key] = { parse_error: true };
      }
    }
    const wrapIds: string[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("okkey.share-wrap", 1);
        req.onerror = () => reject(req.error ?? new Error("idb open failed"));
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("keys")) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction("keys", "readonly");
          const getAll = tx.objectStore("keys").getAllKeys();
          getAll.onsuccess = () => {
            for (const id of getAll.result) {
              wrapIds.push(String(id));
            }
            db.close();
            resolve();
          };
          getAll.onerror = () => reject(getAll.error ?? new Error("idb getAllKeys failed"));
        };
      });
    } catch (error) {
      wrapIds.push(`error:${error instanceof Error ? error.message : String(error)}`);
    }
    return {
      bundles,
      wrapIds,
      href: location.href,
      fingerprint: localStorage.getItem("okkey.device.fingerprint"),
    };
  });
  // eslint-disable-next-line no-console
  console.log(`[tsk-158 ${label}]`, JSON.stringify(diag));
  // eslint-disable-next-line no-console
  console.log(`[tsk-158 ${label} console]`, pageConsole.slice(-50));
}

async function unlockAfterApproveOrFail(page: Page, label: string): Promise<void> {
  await expect(page).toHaveURL(/\/account\/lock|\/items/, { timeout: 90_000 });
  await dumpUnlockDiagnostics(page, label);

  const lock = page.getByRole("heading", { name: /vault is locked/i });
  const topbar = page.getByTestId("items-shell-topbar");
  await expect(lock.or(topbar)).toBeVisible({ timeout: 60_000 });
  if (await topbar.isVisible().catch(() => false)) {
    throw new Error("vault unlocked without master password after passkey approve");
  }
  await page.locator("#unlock-master-password").fill(E2E_MASTER_PASSWORD);
  await page.getByRole("button", { name: /^unlock$/i }).click();
  const incorrect = page.getByText(/incorrect master password/i);
  const unavailable = page.getByText(/device share|not available|denied|approve/i);
  const unlocked = page.getByTestId("items-shell-topbar");
  await expect(incorrect.or(unavailable).or(unlocked)).toBeVisible({ timeout: 60_000 });
  if (await incorrect.isVisible().catch(() => false)) {
    await dumpUnlockDiagnostics(page, `${label}-incorrect`);
    throw new Error("incorrect master password on first unlock after passkey approve");
  }
  if (await unavailable.isVisible().catch(() => false)) {
    await dumpUnlockDiagnostics(page, `${label}-unavailable`);
    throw new Error("device share unavailable on first unlock after passkey approve");
  }
  await expect(unlocked).toBeVisible({ timeout: 5_000 });
}

function asPendingOnly(records: ShareWrapRecord[]): ShareWrapRecord[] {
  const source =
    records.find((row) => row.id !== "pending") ??
    records.find((row) => row.id === "pending") ??
    null;
  if (!source) {
    throw new Error("expected at least one share-wrap IndexedDB row after passkey enroll");
  }
  return [{ ...source, id: "pending" }];
}

test.beforeAll(async ({ browser }) => {
  browserRef = browser;
});

test.beforeEach(async () => {
  // First-run registration requires an empty users table per test.
  await resetE2eCatalog();
});

test.afterAll(async () => {
  await resetE2eCatalog();
});

test("passkey approve on new device → master password unlocks", async () => {
  const email = uniqueEmail("passkey-unlock");
  pageConsole.length = 0;

  const context = await browserRef.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    pageConsole.push(`${msg.type()}:${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    pageConsole.push(`pageerror:${err.message}`);
  });
  page.on("response", (res) => {
    const url = res.url();
    if (
      url.includes("/passkey") ||
      url.includes("/webauthn") ||
      url.includes("/vault/unlock") ||
      url.includes("/devices")
    ) {
      pageConsole.push(`http:${res.status()}:${url}`);
    }
  });

  let passkey: VirtualPasskey | null = null;
  try {
    passkey = await attachVirtualPasskey(page);
    await registerBootstrapAndUnlock(page, {
      email,
      masterPassword: E2E_MASTER_PASSWORD,
    });
    await enrollPasskeyAndAllowApprove(page);

    await wipeLocalBrowserProfile(page);
    await signInWithEmailOtp(page, email);
    await expect(page).toHaveURL(/\/account\/device-pending/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /confirm this device/i })).toBeVisible({
      timeout: 30_000,
    });

    const approve = page.getByRole("button", { name: /approve with passkey/i });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await approve.click();

    await unlockAfterApproveOrFail(page, "after-passkey-approve");

    // Lock → unlock again
    await clearTabVaultUnlock(page);
    await page.goto("/account/lock");
    await dumpUnlockDiagnostics(page, "before-second-unlock");
    await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);

    // Reload while locked → unlock
    await clearTabVaultUnlock(page);
    await page.goto("/account/lock");
    await page.reload();
    await unlockWithMasterPassword(page, E2E_MASTER_PASSWORD);
  } finally {
    if (passkey) {
      await detachVirtualPasskey(passkey);
    }
    await context.close();
  }
});

test("stale pending wrap-key row → promote then unlock after approve", async () => {
  const email = uniqueEmail("passkey-pending-promote");
  pageConsole.length = 0;

  const context = await browserRef.newContext({
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    pageConsole.push(`${msg.type()}:${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    pageConsole.push(`pageerror:${err.message}`);
  });

  let passkey: VirtualPasskey | null = null;
  try {
    passkey = await attachVirtualPasskey(page);
    await registerBootstrapAndUnlock(page, {
      email,
      masterPassword: E2E_MASTER_PASSWORD,
    });
    await enrollPasskeyAndAllowApprove(page);

    const enrolledWraps = await exportShareWrapRecords(page);
    expect(enrolledWraps.length).toBeGreaterThan(0);

    await wipeLocalBrowserProfile(page);
    // Origin must exist before IndexedDB writes stick.
    await page.goto("/auth/sign-in");
    await importShareWrapRecords(page, asPendingOnly(enrolledWraps));
    expect(await listShareWrapIds(page)).toEqual(["pending"]);

    await signInWithEmailOtp(page, email);
    await expect(page).toHaveURL(/\/account\/device-pending/, { timeout: 60_000 });

    const approve = page.getByRole("button", { name: /approve with passkey/i });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await approve.click();

    await expect(page).toHaveURL(/\/account\/lock|\/items/, { timeout: 90_000 });
    // Force the stale-pending failure mode: without promote-on-load, approve
    // sealed via the pending row and clearing it leaves unlock with no wrap key.
    await clearPendingShareWrapRecord(page);
    const wrapIds = await listShareWrapIds(page);
    expect(wrapIds.includes("pending")).toBe(false);
    expect(wrapIds.some((id) => id !== "pending")).toBe(true);

    await unlockAfterApproveOrFail(page, "after-pending-clear");
  } finally {
    if (passkey) {
      await detachVirtualPasskey(passkey);
    }
    await context.close();
  }
});
