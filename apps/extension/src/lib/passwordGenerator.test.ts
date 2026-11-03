import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { describe, it } from "node:test";

import {
  generatePassword,
  type PasswordGeneratorPreferences,
} from "./passwordGenerator.ts";

// Content-script helpers use window.crypto; node:test has no DOM window.
const g = globalThis as typeof globalThis & { window?: { crypto: Crypto; localStorage?: Storage } };
g.window = {
  crypto: webcrypto as Crypto,
  localStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  },
};

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
    // Object.keys(preferences) includes "length"; old code looked up CHARACTER_SETS["length"].
    const password = generatePassword(preferences, preferences.length);
    assert.equal(password.length, 16);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /\d/);
  });
});
