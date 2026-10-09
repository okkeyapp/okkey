import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  categoriesAllowedForFormType,
  detectAutofillFormType,
  isPasswordGeneratorField,
  shouldOpenPasswordGenerator,
  isUsernameGeneratorField,
  type AutofillFormSignals,
  type AutofillFormType,
} from "./autofillFormDetect.ts";
import type { AutofillFieldKind, AutofillInputHints } from "./autofillFieldClassify.ts";

function signals(partial: Partial<AutofillFormSignals> & { fieldKinds: AutofillFieldKind[] }): AutofillFormSignals {
  const passwordFields: AutofillInputHints[] = partial.passwordFields ?? [];
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

function passwordHints(extra: Partial<AutofillInputHints> = {}): AutofillInputHints {
  return { type: "password", name: "password", ...extra };
}

describe("detectAutofillFormType", () => {
  it("detects login: single password + username/email", () => {
    const type: AutofillFormType = detectAutofillFormType(
      signals({
        fieldKinds: ["email", "password"],
        passwordFields: [passwordHints()],
        hasConfirmPassword: false,
        hasCurrentPasswordAc: true,
        formTextBlob: "Sign in",
        urlPath: "/login",
      }),
    );
    assert.equal(type, "login");
  });

  it("detects login without strong wording when shape is classic", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["username", "password"],
          passwordFields: [passwordHints({ name: "pass" })],
          hasConfirmPassword: false,
        }),
      ),
      "login",
    );
  });

  it("detects register: password + confirm password", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["email", "password", "password"],
          passwordFields: [
            passwordHints({ name: "password", autocomplete: "new-password" }),
            passwordHints({ name: "password_confirm", autocomplete: "new-password" }),
          ],
          hasConfirmPassword: true,
          hasNewPasswordAc: true,
          formTextBlob: "Create account",
          urlPath: "/signup",
        }),
      ),
      "register",
    );
  });

  it("detects register: new-password autocomplete without current-password", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["username", "password"],
          passwordFields: [passwordHints({ autocomplete: "new-password" })],
          hasConfirmPassword: false,
          hasNewPasswordAc: true,
          hasCurrentPasswordAc: false,
          urlPath: "/register",
        }),
      ),
      "register",
    );
  });

  it("detects register: identity fields + password", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["given-name", "family-name", "email", "password"],
          passwordFields: [passwordHints({ autocomplete: "new-password" })],
          hasNewPasswordAc: true,
          formTextBlob: "Регистрация",
        }),
      ),
      "register",
    );
  });

  it("detects checkout from card fields", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["email", "cc-number", "cc-exp", "cc-csc"],
          formTextBlob: "Checkout",
        }),
      ),
      "checkout",
    );
  });

  it("detects identity/profile without password", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["given-name", "family-name", "email", "tel"],
          formTextBlob: "Edit profile",
          urlPath: "/settings/profile",
        }),
      ),
      "identity",
    );
  });

  it("detects search to skip", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: [],
          formTextBlob: "Search the site",
          urlPath: "/search",
        }),
      ),
      "search",
    );
  });

  it("register wording + password beats bare login shape", () => {
    assert.equal(
      detectAutofillFormType(
        signals({
          fieldKinds: ["email", "password"],
          passwordFields: [passwordHints()],
          hasConfirmPassword: false,
          formTextBlob: "Sign up for free",
          urlPath: "/signup",
        }),
      ),
      "register",
    );
  });
});

describe("categoriesAllowedForFormType", () => {
  it("login only allows login category", () => {
    assert.deepEqual(categoriesAllowedForFormType("login", "email"), ["login"]);
    assert.deepEqual(categoriesAllowedForFormType("login", "password"), ["login"]);
  });

  it("register suppresses vault suggestions on password/username (generators)", () => {
    assert.deepEqual(categoriesAllowedForFormType("register", "password"), []);
    assert.deepEqual(categoriesAllowedForFormType("register", "username"), []);
    assert.deepEqual(categoriesAllowedForFormType("register", "email"), ["personal_data"]);
    assert.deepEqual(categoriesAllowedForFormType("register", "given-name"), ["personal_data"]);
  });

  it("checkout maps card kinds to credit_card", () => {
    assert.deepEqual(categoriesAllowedForFormType("checkout", "cc-number"), ["credit_card"]);
    assert.deepEqual(categoriesAllowedForFormType("checkout", "email"), ["personal_data"]);
  });

  it("search allows nothing", () => {
    assert.deepEqual(categoriesAllowedForFormType("search", "email"), []);
  });
});

describe("generator field helpers", () => {
  it("username generator only for username kind (not email)", () => {
    assert.equal(isUsernameGeneratorField("username"), true);
    assert.equal(isUsernameGeneratorField("email"), false);
    assert.equal(isPasswordGeneratorField("password"), true);
    assert.equal(isPasswordGeneratorField("email"), false);
  });

  it("opens password generator on register and confirm-password contexts", () => {
    assert.equal(shouldOpenPasswordGenerator("register", "password"), true);
    assert.equal(shouldOpenPasswordGenerator("login", "password"), false);
    assert.equal(shouldOpenPasswordGenerator("unknown", "email"), false);
  });
});
