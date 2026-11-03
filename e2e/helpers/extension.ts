import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium, type BrowserContext } from "@playwright/test";

import { extensionOutputDir } from "./env";

export function extensionBuildReady(): boolean {
  const dir = extensionOutputDir();
  return fs.existsSync(path.join(dir, "manifest.json"));
}

/**
 * Chromium persistent context with unpacked MV3 extension (Playwright docs).
 * Requires a prior `yarn build:extension:chromium`.
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
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 60_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  return { context, extensionId, userDataDir };
}
