import { EFF_LARGE_WORD_LIST } from "./effLargeWordList";

export type PassphraseGeneratorPreferences = {
  numWords: number;
  wordSeparator: string;
  capitalize: boolean;
  includeNumber: boolean;
};

export const DEFAULT_PASSPHRASE_GENERATOR_PREFERENCES: PassphraseGeneratorPreferences = {
  numWords: 3,
  wordSeparator: "-",
  capitalize: false,
  includeNumber: false,
};

export const PASSPHRASE_WORD_COUNT_MIN = 3;
export const PASSPHRASE_WORD_COUNT_MAX = 20;

export const PASSPHRASE_GENERATOR_STORAGE_KEY = "okkey.tools.passphraseGenerator";

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) {
    return 0;
  }
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0]! % maxExclusive;
}

function capitalizeWord(word: string): string {
  if (!word) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Append a single digit (0–9) to a randomly chosen word — Bitwarden-compatible. */
function appendRandomNumberToRandomWord(words: string[]): void {
  if (words.length === 0) {
    return;
  }
  const index = randomInt(words.length);
  words[index] = `${words[index]}${randomInt(10)}`;
}

export function normalizePassphraseGeneratorPreferences(
  value: unknown,
): PassphraseGeneratorPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PASSPHRASE_GENERATOR_PREFERENCES };
  }

  const candidate = value as Partial<Record<keyof PassphraseGeneratorPreferences, unknown>>;
  const rawSeparator =
    typeof candidate.wordSeparator === "string" ? candidate.wordSeparator : "-";
  const wordSeparator =
    rawSeparator.length === 0 ? "-" : rawSeparator.length > 1 ? rawSeparator[0]! : rawSeparator;
  const numWordsRaw =
    typeof candidate.numWords === "number"
      ? candidate.numWords
      : DEFAULT_PASSPHRASE_GENERATOR_PREFERENCES.numWords;

  return {
    numWords: Math.min(
      PASSPHRASE_WORD_COUNT_MAX,
      Math.max(PASSPHRASE_WORD_COUNT_MIN, Math.round(numWordsRaw)),
    ),
    wordSeparator,
    capitalize:
      typeof candidate.capitalize === "boolean"
        ? candidate.capitalize
        : DEFAULT_PASSPHRASE_GENERATOR_PREFERENCES.capitalize,
    includeNumber:
      typeof candidate.includeNumber === "boolean"
        ? candidate.includeNumber
        : DEFAULT_PASSPHRASE_GENERATOR_PREFERENCES.includeNumber,
  };
}

export function loadPassphraseGeneratorPreferences(): PassphraseGeneratorPreferences {
  try {
    return normalizePassphraseGeneratorPreferences(
      JSON.parse(window.localStorage.getItem(PASSPHRASE_GENERATOR_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_PASSPHRASE_GENERATOR_PREFERENCES };
  }
}

export function savePassphraseGeneratorPreferences(
  preferences: PassphraseGeneratorPreferences,
): void {
  try {
    window.localStorage.setItem(PASSPHRASE_GENERATOR_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* ignore */
  }
}

/** Bitwarden-style passphrase from the EFF large word list. */
export function generatePassphrase(preferences: PassphraseGeneratorPreferences): string {
  const words: string[] = [];
  for (let i = 0; i < preferences.numWords; i += 1) {
    const word = EFF_LARGE_WORD_LIST[randomInt(EFF_LARGE_WORD_LIST.length)] ?? "okkey";
    words.push(preferences.capitalize ? capitalizeWord(word) : word);
  }
  if (preferences.includeNumber) {
    appendRandomNumberToRandomWord(words);
  }
  return words.join(preferences.wordSeparator);
}
