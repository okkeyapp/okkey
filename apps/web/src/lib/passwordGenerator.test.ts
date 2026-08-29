import { describe, expect, it } from "vitest";

import { generatePassphrase } from "./passphraseGenerator";
import { generatePassword, getGeneratedPasswordCharKind } from "./passwordGenerator";
import { generateUsername } from "./usernameGenerator";

describe("generatePassword", () => {
  it("includes at least one character from each enabled set", () => {
    const password = generatePassword(
      { uppercase: true, lowercase: true, numbers: true, symbols: true },
      16,
    );
    expect(password).toHaveLength(16);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[!@#$%^&*]/);
  });

  it("classifies characters for colored rendering", () => {
    expect(getGeneratedPasswordCharKind("A")).toBe("letter");
    expect(getGeneratedPasswordCharKind("7")).toBe("number");
    expect(getGeneratedPasswordCharKind("&")).toBe("symbol");
  });
});

describe("generatePassphrase", () => {
  it("joins the requested number of words with the separator", () => {
    const passphrase = generatePassphrase({
      numWords: 4,
      wordSeparator: "-",
      capitalize: false,
      includeNumber: false,
    });
    const parts = passphrase.split("-");
    expect(parts).toHaveLength(4);
    for (const part of parts) {
      expect(part).toMatch(/^[a-z]+$/);
    }
  });

  it("capitalizes words and can include a digit", () => {
    const passphrase = generatePassphrase({
      numWords: 3,
      wordSeparator: " ",
      capitalize: true,
      includeNumber: true,
    });
    const parts = passphrase.split(" ");
    expect(parts).toHaveLength(3);
    expect(parts.every((part) => /^[A-Z]/.test(part))).toBe(true);
    expect(passphrase).toMatch(/\d/);
  });
});

describe("generateUsername", () => {
  it("returns a lowercase word by default", () => {
    const username = generateUsername({ capitalize: false, includeNumber: false });
    expect(username).toMatch(/^[a-z]+$/);
  });

  it("can capitalize and append a 4-digit number", () => {
    const username = generateUsername({ capitalize: true, includeNumber: true });
    expect(username).toMatch(/^[A-Z][a-z]+\d{4}$/);
  });
});
