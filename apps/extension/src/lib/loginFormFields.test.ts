import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyAutofillInput,
  classifyLoginInput,
  suggestionFieldKindsForFocus,
} from "./autofillFieldClassify.ts";
import { otpValuesForFields } from "./loginFormFields.ts";

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
    assert.equal(classifyLoginInput({ type: "search", name: "contact_email" }), "username");
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
