import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyAutofillInput,
  classifyLoginInput,
  looksLikeEmailOtpField,
  resolveFocusedAutofillKind,
  suggestionFieldKindsForFocus,
} from "./autofillFieldClassify.ts";
import {
  applySimpleMaska,
  digitsOnly,
  otpValuesForFields,
  resolveFillValueForInput,
} from "./loginFormFields.ts";

describe("classifyLoginInput email heuristics", () => {
  it("classifies type=email and autocomplete email", () => {
    assert.equal(classifyLoginInput({ type: "email", name: "email" }), "username");
    assert.equal(classifyLoginInput({ type: "text", autocomplete: "email" }), "username");
    assert.equal(classifyLoginInput({ type: "text", autocomplete: "username" }), "username");
  });

  it("classifies mail / e_mail / e-mail name variants", () => {
    assert.equal(classifyLoginInput({ type: "text", name: "mail" }), "username");
    assert.equal(classifyLoginInput({ type: "text", name: "e_mail" }), "username");
    assert.equal(classifyLoginInput({ type: "text", name: "user_email" }), "username");
    assert.equal(classifyLoginInput({ type: "text", id: "EmailAddress" }), "username");
  });

  it("ignores search fields even when name looks like email", () => {
    assert.equal(classifyLoginInput({ type: "search", name: "contact_email" }), null);
    assert.equal(classifyLoginInput({ type: "text", name: "search", placeholder: "Search" }), null);
    assert.equal(classifyLoginInput({ type: "text", autocomplete: "search", name: "q" }), null);
    assert.equal(classifyLoginInput({ type: "text", role: "searchbox", name: "q" }), null);
  });

  it("does not treat OTP / one-time password boxes as password", () => {
    assert.equal(
      classifyLoginInput({ type: "password", name: "otp", autocomplete: "one-time-code" }),
      "otp",
    );
    assert.equal(
      classifyLoginInput({ type: "password", name: "code", maxLength: 1, inputMode: "numeric" }),
      "otp",
    );
    assert.equal(classifyLoginInput({ type: "password", name: "password" }), "password");
  });

  it("npm email-OTP: login_otp + One-Time Password is otp, not username/password", () => {
    // https://www.npmjs.com/login/email-otp — type=text, autocomplete=off, inputmode=numeric
    const npmOtp = {
      type: "text",
      id: "login_otp",
      name: "otp",
      autocomplete: "off",
      inputMode: "numeric",
      labelText: "One-Time Password",
    };
    assert.equal(classifyAutofillInput(npmOtp), "otp");
    assert.equal(classifyLoginInput(npmOtp), "otp");
    assert.equal(
      resolveFocusedAutofillKind(npmOtp, "/login/email-otp?next=/"),
      "otp",
    );
    assert.equal(looksLikeEmailOtpField(npmOtp, "/login/email-otp"), true);
    // Must not fall through to USER_NAME via id `login_*`.
    assert.notEqual(classifyAutofillInput(npmOtp), "username");
    assert.notEqual(classifyAutofillInput(npmOtp), "password");
  });

  it("denies captcha / comment / filter fields", () => {
    assert.equal(classifyAutofillInput({ type: "text", name: "captcha" }), null);
    assert.equal(classifyAutofillInput({ type: "text", name: "comment" }), null);
    assert.equal(classifyAutofillInput({ type: "text", name: "filter" }), null);
    assert.equal(classifyAutofillInput({ type: "checkbox", name: "remember" }), null);
    assert.equal(classifyAutofillInput({ type: "file", name: "avatar" }), null);
  });

  it("classifies placeholder / aria / label / inputMode email", () => {
    assert.equal(classifyLoginInput({ type: "text", placeholder: "Your e-mail" }), "username");
    assert.equal(classifyLoginInput({ type: "text", ariaLabel: "Email address" }), "username");
    assert.equal(classifyLoginInput({ type: "text", labelText: "Электронная почта" }), "username");
    assert.equal(classifyLoginInput({ type: "text", labelText: "Почта" }), "username");
    assert.equal(classifyLoginInput({ type: "text", inputMode: "email" }), "username");
    assert.equal(classifyLoginInput({ type: "text", autocomplete: "section-billing email" }), "username");
  });

  it("still classifies password / otp / ignores unrelated", () => {
    assert.equal(classifyLoginInput({ type: "password" }), "password");
    assert.equal(classifyLoginInput({ type: "text", name: "otp", autocomplete: "one-time-code" }), "otp");
    assert.equal(classifyLoginInput({ type: "text", name: "q" }), null);
  });
});

describe("classifyAutofillInput non-login types", () => {
  it("maps autocomplete=name and Name labels to full name (personal_data)", () => {
    // Register fieldset: Name* autocomplete=name (and label-only / name-input fallbacks).
    assert.equal(
      classifyAutofillInput({
        type: "text",
        autocomplete: "name",
        labelText: "Name* (required)",
        id: "name-input",
      }),
      "name",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", name: "name", labelText: "Name*" }),
      "name",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", id: "name-input", labelText: "Name" }),
      "name",
    );
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Full name" }),
      "name",
    );
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "given-name" }), "given-name");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "family-name" }), "family-name");
    // Must not steal username / first-name.
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "username" }), "username");
    assert.equal(classifyAutofillInput({ type: "text", name: "first-name" }), "given-name");
  });

  it("does not treat entity Name labels as personal name (GitHub ruleset etc.)", () => {
    // GitHub settings → Ruleset Name (required) — not a person's name.
    assert.equal(
      classifyAutofillInput({
        type: "text",
        labelText: "Ruleset Name *",
        ariaLabel: "Ruleset Name",
      }),
      null,
    );
    assert.equal(
      classifyAutofillInput({
        type: "text",
        id: "ruleset-name",
        labelText: "Ruleset Name",
      }),
      null,
    );
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Repository name" }),
      null,
    );
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Workflow name" }),
      null,
    );
    assert.equal(
      classifyAutofillInput({ type: "text", name: "runner-name", labelText: "Runner Name" }),
      null,
    );
    assert.equal(
      classifyAutofillInput({ type: "text", labelText: "Project name" }),
      null,
    );
    // Explicit autocomplete=name still wins even with a noisy label.
    assert.equal(
      classifyAutofillInput({
        type: "text",
        autocomplete: "name",
        labelText: "Ruleset Name",
      }),
      "name",
    );
  });

  it("detects credit card fields", () => {
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "cc-number" }), "cc-number");
    assert.equal(classifyAutofillInput({ type: "text", name: "cvc", autocomplete: "cc-csc" }), "cc-csc");
    assert.equal(classifyAutofillInput({ type: "text", name: "cardExpiry" }), "cc-exp");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "cc-name" }), "cc-name");
    assert.equal(
      classifyAutofillInput({
        type: "text",
        name: "cardNumber",
        id: "cardNumber",
        inputMode: "numeric",
        placeholder: "0000 0000 0000 0000",
      }),
      "cc-number",
    );
  });

  it("Robokassa/GamePush checkout: email stays email next to card fields", () => {
    assert.equal(
      classifyAutofillInput({
        type: "email",
        inputMode: "email",
        name: "EMail",
        autocomplete: "off",
        placeholder: "Email for receipt (required)",
      }),
      "email",
    );
    assert.equal(
      classifyAutofillInput({
        type: "email",
        id: "pre-filled-email",
        autocomplete: "email",
      }),
      "email",
    );
  });

  it("suggestion kinds for focused email ignore sibling card kinds", () => {
    const pageKinds = ["email", "cc-number", "cc-exp", "cc-csc"] as const;
    assert.deepEqual(suggestionFieldKindsForFocus("email", pageKinds), ["email"]);
    assert.deepEqual(suggestionFieldKindsForFocus("cc-number", pageKinds), ["cc-number"]);
    assert.deepEqual(suggestionFieldKindsForFocus(null, pageKinds), [...pageKinds]);
  });

  it("detects personal / address fields", () => {
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "given-name" }), "given-name");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "family-name" }), "family-name");
    assert.equal(classifyAutofillInput({ type: "tel", autocomplete: "tel" }), "tel");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "street-address" }), "street-address");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "address-line1" }), "street-address");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "address-line2" }), "address-apartment");
    assert.equal(classifyAutofillInput({ type: "text", name: "apartment" }), "address-apartment");
    assert.equal(classifyAutofillInput({ type: "text", name: "house" }), "address-house");
    assert.equal(classifyAutofillInput({ type: "text", name: "address" }), "address");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "postal-code" }), "postal-code");
    assert.equal(classifyAutofillInput({ type: "text", name: "city" }), "address-level2");
  });

  it("detects bank / passport / database / crypto", () => {
    assert.equal(classifyAutofillInput({ type: "text", name: "iban" }), "iban");
    assert.equal(classifyAutofillInput({ type: "text", name: "swift" }), "swift");
    assert.equal(classifyAutofillInput({ type: "text", name: "passportNumber" }), "passport-number");
    assert.equal(classifyAutofillInput({ type: "text", name: "db_host" }), "db-server");
    assert.equal(classifyAutofillInput({ type: "text", name: "database" }), "db-name");
    assert.equal(classifyAutofillInput({ type: "password", name: "db_password" }), "db-password");
    assert.equal(classifyAutofillInput({ type: "text", name: "walletAddress" }), "crypto-address");
  });

  it("maps email semantic kind separately from username", () => {
    assert.equal(classifyAutofillInput({ type: "email" }), "email");
    assert.equal(classifyAutofillInput({ type: "text", autocomplete: "username" }), "username");
  });
});

describe("otpValuesForFields", () => {
  it("puts one digit per input for 6-box OTP", () => {
    assert.deepEqual(otpValuesForFields("123456", 6, [1, 1, 1, 1, 1, 1]), [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("splits by field count when lengths match TOTP", () => {
    assert.deepEqual(otpValuesForFields("847291", 6, [-1, -1, -1, -1, -1, -1]), [
      "8",
      "4",
      "7",
      "2",
      "9",
      "1",
    ]);
  });

  it("fills the full code into a single OTP field", () => {
    assert.deepEqual(otpValuesForFields("123456", 1, [6]), ["123456"]);
  });
});

describe("maska-aware credit card fill formatting", () => {
  it("formats Robokassa card / exp / cvc masks from raw vault values", () => {
    assert.equal(applySimpleMaska("4111111111111111", "#### #### #### #### ###"), "4111 1111 1111 1111");
    assert.equal(applySimpleMaska("4111 1111 1111 1111", "#### #### #### #### ###"), "4111 1111 1111 1111");
    assert.equal(applySimpleMaska("12/30", "##/##"), "12/30");
    assert.equal(applySimpleMaska("12 / 30", "##/##"), "12/30");
    assert.equal(applySimpleMaska("1230", "##/##"), "12/30");
    assert.equal(applySimpleMaska("123", "###"), "123");
    assert.equal(digitsOnly("4111 1111 1111 1111"), "4111111111111111");
  });

  it("resolveFillValueForInput reads data-maska like Robokassa checkout", () => {
    const withMask = (mask: string) => ({
      getAttribute: (name: string) => (name === "data-maska" ? mask : null),
    });
    assert.equal(resolveFillValueForInput(withMask("#### #### #### #### ###"), "4111111111111111"), "4111 1111 1111 1111");
    assert.equal(resolveFillValueForInput(withMask("##/##"), "12 / 30"), "12/30");
    assert.equal(resolveFillValueForInput(withMask("###"), "123"), "123");
    assert.equal(resolveFillValueForInput(withMask(""), "4111111111111111"), "4111111111111111");
  });

  it("classifies Robokassa validTo / cvc fields for deferred fill", () => {
    assert.equal(
      classifyAutofillInput({
        type: "text",
        name: "validTo",
        id: "validTo",
        autocomplete: "cc-exp",
      }),
      "cc-exp",
    );
    assert.equal(
      classifyAutofillInput({
        type: "text",
        name: "cvc",
        id: "cvc",
      }),
      "cc-csc",
    );
  });

  it("does not classify birth-date placeholders as cc-exp", () => {
    assert.equal(
      classifyAutofillInput({
        type: "text",
        autocomplete: "bday",
        ariaLabel: "дата рождения",
        placeholder: "dd/mm/yyyy",
      }),
      "bday",
    );
    assert.equal(
      classifyAutofillInput({
        type: "text",
        ariaLabel: "дата рождения",
        placeholder: "dd.mm.yyyy",
      }),
      "bday",
    );
    assert.equal(
      classifyAutofillInput({
        type: "text",
        placeholder: "dd/mm/yyyy",
      }),
      null,
    );
    assert.equal(
      classifyAutofillInput({
        type: "text",
        name: "cardExpiry",
        placeholder: "mm/yy",
      }),
      "cc-exp",
    );
  });
});
