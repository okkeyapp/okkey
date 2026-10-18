import fs from "node:fs";

import { expect, test } from "@playwright/test";

import { extensionBuildReady, launchExtensionContext } from "../helpers/extension";

/**
 * qa/extension smoke (enterprise#110 scenario 5): load unpacked Chromium extension.
 *
 * CI runs this under xvfb with E2E_EXTENSION=1 after `yarn build:extension:chromium`.
 * Full PKCE → autofill → lock-timeout is out of scope for this harness (follow-up).
 */
test.describe("extension smoke", () => {
  test.skip(
    process.env.E2E_EXTENSION !== "1" || !extensionBuildReady(),
    "set E2E_EXTENSION=1 and run yarn build:extension:chromium",
  );

  test("5) Chromium loads unpacked MV3 extension (service worker)", async () => {
    const { context, extensionId, userDataDir } = await launchExtensionContext();
    try {
      expect(extensionId.length).toBeGreaterThan(8);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup.html`).catch(async () => {
        // Popup path varies by WXT build; any chrome-extension origin proves load.
        await page.goto(`chrome-extension://${extensionId}/`);
      });
      await expect(page).toHaveURL(/chrome-extension:\/\//);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
