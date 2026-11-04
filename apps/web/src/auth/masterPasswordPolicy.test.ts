import { formatWebMessage } from "@okkey/i18n";
import {
  MIN_MASTER_PASSWORD_LENGTH,
  MASTER_PASSWORD_POLICY_VERSION,
  isCurrentMasterPasswordPolicyVersion,
  masterPasswordMeetsNewPasswordPolicy,
  masterPasswordUtf8Length,
  readShortMasterPasswordHintDismissed,
  shouldSuggestLongerMasterPassword,
  shortMasterPasswordHintDismissedStorageKey,
  writeShortMasterPasswordHintDismissed,
} from "@okkey/types";
import { describe, expect, it } from "vitest";

describe("master password policy", () => {
  it("requires 12 characters for a new password and counts UTF-16 code units", () => {
    expect(MIN_MASTER_PASSWORD_LENGTH).toBe(12);
    expect(MASTER_PASSWORD_POLICY_VERSION).toBe(1);
    expect(masterPasswordMeetsNewPasswordPolicy("12345678901")).toBe(false);
    expect(masterPasswordMeetsNewPasswordPolicy("123456789012")).toBe(true);
    expect(masterPasswordMeetsNewPasswordPolicy("пароль")).toBe(false);
    const utf8 = new TextEncoder().encode("пароль");
    expect(utf8.length).toBe(12);
    expect(masterPasswordUtf8Length(utf8)).toBe(6);
  });

  it("accepts only the current policy version", () => {
    expect(isCurrentMasterPasswordPolicyVersion(MASTER_PASSWORD_POLICY_VERSION)).toBe(true);
    expect(isCurrentMasterPasswordPolicyVersion(0)).toBe(false);
    expect(isCurrentMasterPasswordPolicyVersion("1")).toBe(false);
    expect(isCurrentMasterPasswordPolicyVersion(undefined)).toBe(false);
  });

  it("suggests a longer password only when this unlock observed a short length", () => {
    expect(shouldSuggestLongerMasterPassword({ passwordLength: 4, dismissed: false })).toBe(true);
    expect(shouldSuggestLongerMasterPassword({ passwordLength: 12, dismissed: false })).toBe(false);
    expect(shouldSuggestLongerMasterPassword({ passwordLength: 4, dismissed: true })).toBe(false);
    expect(shouldSuggestLongerMasterPassword({ passwordLength: 0, dismissed: false })).toBe(false);
  });

  it("stores a dismissal flag without the password or its length", () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    };
    const userId = "user-1";
    expect(readShortMasterPasswordHintDismissed(storage, userId)).toBe(false);
    writeShortMasterPasswordHintDismissed(storage, userId);
    const key = shortMasterPasswordHintDismissedStorageKey(userId);
    expect(saved.get(key)).toBe("1");
    expect(key.includes("4")).toBe(false);
    expect(readShortMasterPasswordHintDismissed(storage, userId)).toBe(true);
  });

  it("ships the length message in every web locale", () => {
    const keys = [
      "auth.registration.reqPasswordLength",
      "web.settingsPopup.vault.changePassword.tooShort",
      "account.restore.passwordTooShort",
      "unlock.shortMasterPasswordHint",
      "unlock.shortMasterPasswordHint.change",
      "unlock.shortMasterPasswordHint.dismiss",
      "auth.masterPassword.policyRejected",
    ] as const;
    for (const locale of ["en", "ru"] as const) {
      for (const key of keys) {
        const text = formatWebMessage(locale, key, { min: MIN_MASTER_PASSWORD_LENGTH });
        expect(text.length).toBeGreaterThan(0);
        if (key.includes("tooShort") || key.includes("reqPasswordLength") || key.endsWith("passwordTooShort") || key.endsWith("Hint")) {
          if (!key.endsWith(".change") && !key.endsWith(".dismiss")) {
            expect(text).toContain(String(MIN_MASTER_PASSWORD_LENGTH));
          }
        }
      }
    }
    expect(
      formatWebMessage("en", "web.settingsPopup.vault.changePassword.tooShort", {
        min: MIN_MASTER_PASSWORD_LENGTH,
      }),
    ).toBe("Master password must be at least 12 characters");
    expect(
      formatWebMessage("ru", "account.restore.passwordTooShort", {
        min: MIN_MASTER_PASSWORD_LENGTH,
      }),
    ).toBe("Мастер-пароль должен быть не короче 12 символов");
  });
});
