import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generatePassword,
  loadPasswordGeneratorPreferences,
  type PasswordGeneratorPreferences,
} from "./passwordGenerator.ts";

describe("generatePassword", () => {
  it("does not crash when preferences (with numeric length) are passed as settings", () => {
    const preferences: PasswordGeneratorPreferences = {
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: false,
      length: 16,
    };
    // createPasswordGeneratorState calls generatePassword(preferences, preferences.length).
    const password = generatePassword(preferences, preferences.length);
    assert.equal(password.length, 16);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /\d/);
  });

  it("matches loadPasswordGeneratorPreferences → generatePassword overlay path", () => {
    const preferences = loadPasswordGeneratorPreferences();
    const password = generatePassword(preferences, preferences.length);
    assert.ok(password.length >= 4);
  });
});
