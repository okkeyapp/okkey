import { expect, type Page } from "@playwright/test";

import { E2E_MASTER_PASSWORD, E2E_OTP_CODE } from "./env.ts";

/** qa/web 3.1–3.6 + 4.5: empty-DB bootstrap → recovery export → unlock. */
export async function registerBootstrapAndUnlock(
  page: Page,
  input: {
    email: string;
    masterPassword?: string;
    firstName?: string;
    lastName?: string;
  },
): Promise<{ recoveryKey: string }> {
  const masterPassword = input.masterPassword ?? E2E_MASTER_PASSWORD;
  const firstName = input.firstName ?? "E2E";
  const lastName = input.lastName ?? "User";

  await page.goto("/auth/email");
  await expect(page.getByRole("heading", { name: /welcome to okkey/i })).toBeVisible();
  await page.locator("#auth-email").fill(input.email);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page.getByRole("heading", { name: /registration/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#auth-reg-first-name").fill(firstName);
  await page.locator("#auth-reg-last-name").fill(lastName);
  await page.locator("#auth-reg-master-password").fill(masterPassword);
  await page.locator("#auth-reg-repeat-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^sign up$|^register|^зарегистрироваться$/i }).click();

  // EN copy: "Sign up" may differ — fall back to registration submit label.
  // AuthRegistrationPage uses t("auth.registration.submit") = "Sign up" / "Зарегистрироваться".
  // If still on form (button already clicked), wait for recovery screen.
  await expect(page.getByRole("heading", { name: /save your recovery key|сохраните ключ/i })).toBeVisible({
    timeout: 90_000,
  });

  const next = page.getByRole("button", { name: /^(continue|next|далее)$/i });
  await expect(next).toBeDisabled();

  const recoveryKey = (await page.locator("p.font-mono").first().innerText()).trim();
  expect(recoveryKey.length).toBeGreaterThan(16);

  await page.getByRole("button", { name: /^(copy|скопировать)$/i }).click();
  await expect(next).toBeEnabled({ timeout: 15_000 });
  await next.click();

  await expect(page.getByRole("heading", { name: /vault is locked|хранилище закрыто/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#unlock-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^(unlock|разблокировать)$/i }).click();

  await expect(page).toHaveURL(/\/items/, { timeout: 60_000 });
  return { recoveryKey };
}

/** Email + fixed OTP (AUTH_E2E_FIXED_CODE) for a returning user. */
export async function signInWithEmailOtp(page: Page, email: string, otp = E2E_OTP_CODE): Promise<void> {
  await page.goto("/auth/email");
  await page.locator("#auth-email").fill(email);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: /verification code|код подтверждения/i })).toBeVisible({
    timeout: 30_000,
  });
  // OTP inputs: six digits — prefer a single field if present, else fill cells.
  const single = page.locator('input[autocomplete="one-time-code"], input[name="otp"], #auth-otp');
  if (await single.count()) {
    await single.first().fill(otp);
  } else {
    const cells = page.locator('input[inputmode="numeric"], input[maxlength="1"]');
    const count = await cells.count();
    if (count >= 6) {
      for (let i = 0; i < 6; i += 1) {
        await cells.nth(i).fill(otp[i]!);
      }
    } else {
      await page.keyboard.type(otp);
    }
  }
}

export async function unlockWithMasterPassword(
  page: Page,
  masterPassword = E2E_MASTER_PASSWORD,
): Promise<void> {
  await expect(page.getByRole("heading", { name: /vault is locked|хранилище закрыто/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#unlock-master-password").fill(masterPassword);
  await page.getByRole("button", { name: /^(unlock|разблокировать)$/i }).click();
  await expect(page).toHaveURL(/\/items/, { timeout: 60_000 });
}
