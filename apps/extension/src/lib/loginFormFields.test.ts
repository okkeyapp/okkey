import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyLoginInput, otpValuesForFields } from "./loginFormFields.ts";

describe("classifyLoginInput", () => {
  it("classifies password / username / otp", () => {
    assert.equal(classifyLoginInput({ type: "password" }), "password");
    assert.equal(classifyLoginInput({ type: "email", name: "email" }), "username");
    assert.equal(classifyLoginInput({ type: "text", autocomplete: "username" }), "username");
    assert.equal(classifyLoginInput({ type: "text", name: "otp", autocomplete: "one-time-code" }), "otp");
    assert.equal(classifyLoginInput({ type: "text", name: "q" }), null);
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
