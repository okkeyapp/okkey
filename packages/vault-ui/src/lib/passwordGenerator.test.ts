import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import { EFF_LARGE_WORD_LIST } from "./effLargeWordList";
import { generatePassphrase } from "./passphraseGenerator";
import {
  ensurePasswordGeneratorCharset,
  generatePassword,
  getGeneratedPasswordCharKind,
  normalizePasswordGeneratorPreferences,
} from "./passwordGenerator";
import { generateUsername } from "./usernameGenerator";

const g = globalThis as typeof globalThis & {
  window?: { crypto: Crypto; localStorage?: Storage };
};
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

describe("ensurePasswordGeneratorCharset", () => {
  it("falls back to lowercase when every charset is disabled", () => {
    expect(
      ensurePasswordGeneratorCharset({
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
      }),
    ).toEqual({
      uppercase: false,
      lowercase: true,
      numbers: false,
      symbols: false,
    });
  });

  it("leaves an already-enabled charset unchanged", () => {
    expect(
      ensurePasswordGeneratorCharset({
        uppercase: false,
        lowercase: false,
        numbers: true,
        symbols: false,
      }),
    ).toEqual({
      uppercase: false,
      lowercase: false,
      numbers: true,
      symbols: false,
    });
  });
});

describe("normalizePasswordGeneratorPreferences", () => {
  it("falls back to lowercase when stored prefs disable every charset", () => {
    expect(
      normalizePasswordGeneratorPreferences({
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        length: 20,
      }),
    ).toMatchObject({
      uppercase: false,
      lowercase: true,
      numbers: false,
      symbols: false,
      length: 20,
    });
  });
});

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

/** Longest dictionary match so a hyphen inside a word is not a separator. */
function passphraseWords(passphrase: string, separator: string): string[] {
  const words: string[] = [];
  let rest = passphrase;
  while (rest.length > 0) {
    let match = "";
    for (const word of EFF_LARGE_WORD_LIST) {
      if (word.length <= match.length) {
        continue;
      }
      if (rest === word || rest.startsWith(`${word}${separator}`)) {
        match = word;
      }
    }
    if (!match) {
      throw new Error(`unrecognized passphrase prefix: ${rest}`);
    }
    words.push(match);
    rest = rest.slice(match.length);
    if (rest.startsWith(separator)) {
      rest = rest.slice(separator.length);
    }
  }
  return words;
}

describe("generatePassphrase", () => {
  it("joins the requested number of words with the separator", () => {
    const passphrase = generatePassphrase({
      numWords: 4,
      wordSeparator: "-",
      capitalize: false,
      includeNumber: false,
    });
    const words = passphraseWords(passphrase, "-");
    expect(words).toHaveLength(4);
    expect(words.every((word) => EFF_LARGE_WORD_LIST.includes(word))).toBe(true);
  });

  it("treats hyphenated wordlist entries as a single word", () => {
    const indexes = EFF_LARGE_WORD_LIST.flatMap((word, index) =>
      word.includes("-") ? [index] : [],
    );
    expect(indexes.length).toBeGreaterThan(0);
    const cryptoObj = g.window!.crypto;
    const original = cryptoObj.getRandomValues.bind(cryptoObj);
    const queue = [...indexes];
    cryptoObj.getRandomValues = ((array: Uint32Array) => {
      array[0] = queue.shift() ?? 0;
      return array;
    }) as typeof cryptoObj.getRandomValues;
    try {
      const passphrase = generatePassphrase({
        numWords: indexes.length,
        wordSeparator: "-",
        capitalize: false,
        includeNumber: false,
      });
      expect(passphraseWords(passphrase, "-")).toEqual(
        indexes.map((index) => EFF_LARGE_WORD_LIST[index]),
      );
    } finally {
      cryptoObj.getRandomValues = original;
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
    expect(EFF_LARGE_WORD_LIST).toContain(username);
  });

  it("can capitalize and append a 4-digit number", () => {
    const username = generateUsername({ capitalize: true, includeNumber: true });
    const matched = username.match(/^(.*)(\d{4})$/);
    expect(matched).not.toBeNull();
    const word = matched![1]!;
    expect(word.charAt(0)).toBe(word.charAt(0).toUpperCase());
    expect(word.slice(1)).toBe(word.slice(1).toLowerCase());
    expect(EFF_LARGE_WORD_LIST).toContain(word.toLowerCase());
  });
});
