import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyLoginInput } from "./loginFormFields.ts";

describe("classifyLoginInput", () => {
  it("classifies password / username / otp", () => {
    assert.equal(classifyLoginInput({ type: "password" }), "password");
    assert.equal(classifyLoginInput({ type: "email", name: "email" }), "username");
    assert.equal(classifyLoginInput({ type: "text", autocomplete: "username" }), "username");
    assert.equal(classifyLoginInput({ type: "text", name: "otp", autocomplete: "one-time-code" }), "otp");
    assert.equal(classifyLoginInput({ type: "text", name: "q" }), null);
  });
});
