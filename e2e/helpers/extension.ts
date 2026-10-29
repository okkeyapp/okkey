import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";

import { completeEmailOtpOnPage } from "./auth";
import { E2E_BASE_URL, extensionOutputDir } from "./env";

export function extensionBuildReady(): boolean {
  const dir = extensionOutputDir();
  return fs.existsSync(path.join(dir, "manifest.json"));
}

/**
 * Chromium persistent context with unpacked MV3 extension (Playwright docs).
 * Requires a prior `yarn build:extension:chromium`.
 *
 * Seeds English locale before first popup paint — extension default is `ru`.
 */
export async function launchExtensionContext(): Promise<{
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
}> {
  const extensionPath = extensionOutputDir();
  if (!extensionBuildReady()) {
    throw new Error(`extension build missing at ${extensionPath} (run yarn build:extension:chromium)`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "okkey-e2e-ext-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: false,
    locale: "en-US",
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--lang=en-US",
    ],
  });

  // Popup defaults to Russian unless chrome.storage / localStorage mirror says otherwise.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("okkey.extension.locale", "en");
    } catch {
      /* ignore */
    }
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 60_000 });
  }
  try {
    await serviceWorker.evaluate(async () => {
      // chrome is available in the extension service worker.
      await (
        globalThis as unknown as {
          chrome: { storage: { local: { set: (v: Record<string, string>) => Promise<void> } } };
        }
      ).chrome.storage.local.set({ "okkey.extension.locale": "en" });
    });
  } catch {
    // Best-effort; popup may still fall back to language switcher / bilingual selectors.
  }
  const extensionId = new URL(serviceWorker.url()).host;
  return { context, extensionId, userDataDir };
}

async function openExtensionPopup(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`).catch(async () => {
    await popup.goto(`chrome-extension://${extensionId}/`);
  });
  await expect(popup).toHaveURL(/chrome-extension:\/\//);
  return popup;
}

/**
 * Click Trust device on the primary web session until the extension leaves pending.
 * May need more than one click if the PKCE auth tab also registered a web device.
 */
async function trustPendingDevicesUntilExtensionUnlock(
  trustPage: Page,
  popup: Page,
): Promise<void> {
  const unlockHeading = popup.getByRole("heading", {
    name: /vault is locked|хранилище закрыто/i,
  });
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (await unlockHeading.isVisible().catch(() => false)) {
      return;
    }
    // Primary web smoke runs en-US; keep both labels for safety.
    const trust = trustPage.getByRole("button", {
      name: /^trust device$|^доверять устройству$/i,
    });
    if (await trust.isVisible().catch(() => false)) {
      await trust.click();
    }
    await popup.waitForTimeout(1_500);
  }

  await expect(unlockHeading).toBeVisible({ timeout: 5_000 });
}

/**
 * Real extension scenario: Server URL → PKCE email OTP → device trust → unlock → item visible.
 * `trustPage` must be the already-signed-in primary web device (unlocked on /items).
 */
export async function extensionPkceSignInUnlockAndSeeItem(input: {
  trustPage: Page;
  email: string;
  masterPassword: string;
  itemTitle: string;
  webBaseUrl?: string;
}): Promise<void> {
  const webBaseUrl = input.webBaseUrl ?? E2E_BASE_URL;
  const { context, extensionId, userDataDir } = await launchExtensionContext();

  try {
    const popup = await openExtensionPopup(context, extensionId);

    // Prefer English (seeded above); fall back to switching the language combobox.
    const welcomeEn = popup.getByRole("heading", { name: /welcome to okkey/i });
    const welcomeRu = popup.getByRole("heading", { name: /добро пожаловать в okkey/i });
    await expect(welcomeEn.or(welcomeRu)).toBeVisible({ timeout: 30_000 });
    if (await welcomeRu.isVisible().catch(() => false)) {
      const lang = popup.getByRole("combobox").first();
      await lang.click();
      await popup.getByRole("option", { name: /english|английский/i }).click();
      await expect(welcomeEn).toBeVisible({ timeout: 15_000 });
    }

    await popup.locator("#base-url").fill(webBaseUrl);

    const authPagePromise = context.waitForEvent("page", { timeout: 60_000 });
    await popup.getByRole("button", { name: /^sign in$/i }).click();
    const authPage = await authPagePromise;

    await expect(authPage).toHaveURL(/\/auth\//, { timeout: 60_000 });
    await completeEmailOtpOnPage(authPage, input.email);

    // Handoff redirects to the extension callback (no vault unlock on web).
    await expect(authPage).toHaveURL(/chrome-extension:\/\/.*auth-callback/, {
      timeout: 90_000,
    });
    await expect(
      authPage.getByText(/signed in|вы вошли|сессия готова/i).first(),
    ).toBeVisible({ timeout: 60_000 });

    // Popup stays on "signing-in" until Continue reads chrome.storage session.
    const continueBtn = popup.getByRole("button", { name: /^continue$|^продолжить$/i });
    await expect(continueBtn).toBeVisible({ timeout: 30_000 });
    await continueBtn.click();

    const unlockHeading = popup.getByRole("heading", {
      name: /vault is locked|хранилище закрыто/i,
    });
    const pendingTitle = popup.getByRole("heading", {
      name: /confirm this device|подтвердите это устройство/i,
    });
    await expect(unlockHeading.or(pendingTitle)).toBeVisible({ timeout: 60_000 });

    if (await pendingTitle.isVisible().catch(() => false)) {
      await trustPendingDevicesUntilExtensionUnlock(input.trustPage, popup);
    }

    await expect(unlockHeading).toBeVisible({ timeout: 60_000 });
    await popup.locator("#unlock-master-password").fill(input.masterPassword);
    await popup.getByRole("button", { name: /^unlock$|^разблокировать$/i }).click();

    await expect(popup.getByText(input.itemTitle, { exact: false }).first()).toBeVisible({
      timeout: 90_000,
    });
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}
