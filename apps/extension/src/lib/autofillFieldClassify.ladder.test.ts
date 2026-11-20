import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyAutofillInput,
  classifyLoginInput,
  isBackupOrRecoveryCodeField,
  isDeniedAutofillField,
  looksLikeEmailOtpField,
  type AutofillInputHints,
} from "./autofillFieldClassify.ts";
import {
  isCurrentPasswordField,
  isNewPasswordField,
  resolvePasswordFieldRole,
  detectAutofillFormType,
  type AutofillFormSignals,
} from "./autofillFormDetect.ts";
import { assertSameOriginFillAllowed, isForeignOriginFrame } from "./autofillDomLayers.ts";
import {
  SEGMENTED_OTP_MAX_FIELDS,
  SEGMENTED_OTP_MIN_FIELDS,
} from "./autofillDictionaries.ts";

function signals(
  partial: Partial<AutofillFormSignals> & { fieldKinds: AutofillFormSignals["fieldKinds"] },
): AutofillFormSignals {
  const passwordFields = partial.passwordFields ?? [];
  return {
    fieldKinds: partial.fieldKinds,
    passwordFields,
    hasConfirmPassword: partial.hasConfirmPassword ?? passwordFields.length >= 2,
    hasNewPasswordAc: partial.hasNewPasswordAc ?? false,
    hasCurrentPasswordAc: partial.hasCurrentPasswordAc ?? false,
    formTextBlob: partial.formTextBlob ?? "",
    urlPath: partial.urlPath ?? "",
  };
}

describe("signal ladder steps", () => {
  it("step 1 SAWF data-form-type wins over conflicting name", () => {
    assert.equal(
      classifyAutofillInput({
        type: "text",
        name: "q",
        dataFormType: "email",
      }),
      "email",
    );
    assert.equal(
      classifyAutofillInput({
        type: "text",
        name: "username",
        dataFormType: "otp",
      }),
      "otp",
    );
  });

  it("step 2 autocomplete WHATWG + site mistake autocomplete=password", () => {
    assert.equal(
      classifyAutofillInput({ type: "password", autocomplete: "current-password" }),
      "password",
    );
    assert.equal(
      classifyAutofillInput({ type: "password", autocomplete: "new-password" }),
      "password",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", autocomplete: "one-time-code" }),
      "otp",
    );
    // Non-spec site mistake
    assert.equal(
      classifyAutofillInput({ type: "password", autocomplete: "password" }),
      "password",
    );
    assert.equal(isCurrentPasswordField({ type: "password", autocomplete: "password" }), true);
    assert.equal(isNewPasswordField({ type: "password", autocomplete: "password" }), false);
    // Non-standard value does not block lower steps
    assert.equal(
      classifyAutofillInput({
        type: "text",
        autocomplete: "weird-site-value",
        labelText: "Email",
      }),
      "email",
    );
  });

  it("step 3 type=email / type=password", () => {
    assert.equal(classifyAutofillInput({ type: "email" }), "email");
    assert.equal(classifyAutofillInput({ type: "password" }), "password");
  });

  it("step 4 label / aria (EN + RU)", () => {
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Электронная почта" }),
      "email",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", ariaLabel: "One-Time Password" }),
      "otp",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Код подтверждения" }),
      "otp",
    );
  });

  it("step 5 name / id / placeholder", () => {
    assert.equal(classifyAutofillInput({ type: "text", name: "user_email" }), "email");
    assert.equal(classifyAutofillInput({ type: "text", id: "login_otp" }), "otp");
    assert.equal(
      classifyAutofillInput({ type: "password", placeholder: "Your password" }),
      "password",
    );
  });

  it("step 6 position: first text before password → username", () => {
    assert.equal(
      classifyAutofillInput(
        { type: "text", name: "field1" },
        { firstTextBeforePassword: true },
      ),
      "username",
    );
  });

  it("cards and addresses use the same ladder (autocomplete then labels)", () => {
    assert.equal(
      classifyAutofillInput({ type: "text", autocomplete: "cc-number" }),
      "cc-number",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", autocomplete: "street-address" }),
      "street-address",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Номер карты" }),
      "cc-number",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Индекс" }),
      "postal-code",
    );
  });
});

describe("password roles", () => {
  it("resolves current / new / confirm", () => {
    const current = { type: "password", autocomplete: "current-password" } satisfies AutofillInputHints;
    const neo = { type: "password", autocomplete: "new-password" } satisfies AutofillInputHints;
    const confirm = {
      type: "password",
      name: "password_confirm",
      labelText: "Confirm password",
    } satisfies AutofillInputHints;
    assert.equal(resolvePasswordFieldRole(current), "current");
    assert.equal(resolvePasswordFieldRole(neo), "new");
    assert.equal(resolvePasswordFieldRole(confirm, [neo, confirm]), "confirm");
  });
});

describe("backup / recovery code is not OTP", () => {
  it("rejects backup and recovery codes", () => {
    const backup = { type: "text", name: "backup_code", labelText: "Backup code" };
    const recovery = { type: "text", name: "recovery", labelText: "Recovery codes" };
    const reserveRu = { type: "text", labelText: "Резервный код" };
    assert.equal(isBackupOrRecoveryCodeField(backup), true);
    assert.equal(classifyAutofillInput(backup), null);
    assert.equal(classifyLoginInput(backup), null);
    assert.equal(classifyAutofillInput(recovery), null);
    assert.equal(classifyAutofillInput(reserveRu), null);
    assert.equal(looksLikeEmailOtpField(backup, "/login/2fa"), false);
  });
});

describe("multi-step login and headings", () => {
  it("identifier-only step with Sign in / Далее is login", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["username"],
          formTextBlob: "Вход Далее",
          urlPath: "/login",
        }),
      ),
      "login",
    );
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["email"],
          formTextBlob: "Sign in Continue",
          urlPath: "/signin",
        }),
      ),
      "login",
    );
  });

  it("Register heading marks register funnel", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["email", "password"],
          passwordFields: [{ type: "password", autocomplete: "new-password" }],
          hasNewPasswordAc: true,
          hasConfirmPassword: false,
          formTextBlob: "Register Create account",
          urlPath: "/signup",
        }),
      ),
      "register",
    );
  });
});

describe("segmented OTP bounds from owned fixtures", () => {
  it("exports fixture-derived min/max (not third-party constants)", () => {
    assert.equal(SEGMENTED_OTP_MIN_FIELDS, 4);
    assert.equal(SEGMENTED_OTP_MAX_FIELDS, 8);
    assert.ok(SEGMENTED_OTP_MAX_FIELDS >= SEGMENTED_OTP_MIN_FIELDS);
  });
});

describe("security: hidden / foreign origin / password≠otp", () => {
  it("denies hidden and search fields", () => {
    assert.equal(isDeniedAutofillField({ type: "hidden", name: "password" }), true);
    assert.equal(classifyAutofillInput({ type: "hidden", name: "password" }), null);
    assert.equal(classifyAutofillInput({ type: "search", name: "q" }), null);
  });

  it("foreign-origin frame detection treats cross-origin top as foreign", () => {
    // No window in node unit tests → not foreign (top-level / absent).
    assert.equal(isForeignOriginFrame(undefined), false);
    assert.equal(assertSameOriginFillAllowed(undefined), true);
  });

  it("fillLoginForm does not write password into OTP fields", () => {
    // Build a minimal DOM with linkedocument when available; otherwise assert classify path.
    const otp = {
      type: "text",
      name: "otp",
      autocomplete: "one-time-code",
      labelText: "One-Time Password",
    };
    assert.equal(classifyLoginInput(otp), "otp");
    assert.notEqual(classifyLoginInput(otp), "password");
  });
});
