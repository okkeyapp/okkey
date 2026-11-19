import { devices, expect, test } from "@playwright/test";

import {
  assertDialogActionButtonsInViewport,
  assertNoHorizontalOverflow,
  assertPendingDeviceRowsDoNotOverlap,
} from "../helpers/modalLayout";

/**
 * Layout regression for Account recovery request device/geo rows.
 * Uses the Dev UI fixture (no auth) so desktop + mobile widths can be checked
 * without the enterprise recovery flow.
 */
const iphone = devices["iPhone 13"];
const RECOVERY_POPUP_PATH = "/dev/ui/popup?popup=recoveryDevice";

async function openRecoveryPopup(page: import("@playwright/test").Page) {
  await page.goto(RECOVERY_POPUP_PATH);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /account recovery request/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(dialog.getByTestId("pending-device-info-card")).toBeVisible();
  return dialog;
}

test("Account recovery request rows do not overlap at desktop 1280x800", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = await openRecoveryPopup(page);
  await assertPendingDeviceRowsDoNotOverlap(dialog);
  await assertNoHorizontalOverflow(page, dialog);
  await assertDialogActionButtonsInViewport(page, dialog, [
    dialog.getByRole("button", { name: /^approve$/i }),
    dialog.getByRole("button", { name: /^reject$/i }),
  ]);
});

test("Account recovery request rows do not overlap on iPhone viewport", async ({ page }) => {
  await page.setViewportSize(iphone.viewport ?? { width: 390, height: 844 });
  const dialog = await openRecoveryPopup(page);
  await assertPendingDeviceRowsDoNotOverlap(dialog);
  await assertNoHorizontalOverflow(page, dialog);
  await assertDialogActionButtonsInViewport(page, dialog, [
    dialog.getByRole("button", { name: /^approve$/i }),
    dialog.getByRole("button", { name: /^reject$/i }),
  ]);
});

test("Account recovery request rows do not overlap at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const dialog = await openRecoveryPopup(page);
  await assertPendingDeviceRowsDoNotOverlap(dialog);
  await assertNoHorizontalOverflow(page, dialog);
});
