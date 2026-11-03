import { EFF_LARGE_WORD_LIST } from "./effLargeWordList";

export type UsernameGeneratorPreferences = {
  capitalize: boolean;
  includeNumber: boolean;
};

export const DEFAULT_USERNAME_GENERATOR_PREFERENCES: UsernameGeneratorPreferences = {
  capitalize: false,
  includeNumber: false,
};

export const USERNAME_GENERATOR_STORAGE_KEY = "okkey.tools.usernameGenerator";

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

export function normalizeUsernameGeneratorPreferences(
  value: unknown,
): UsernameGeneratorPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_USERNAME_GENERATOR_PREFERENCES };
  }

  const candidate = value as Partial<Record<keyof UsernameGeneratorPreferences, unknown>>;
  return {
    capitalize:
      typeof candidate.capitalize === "boolean"
        ? candidate.capitalize
        : DEFAULT_USERNAME_GENERATOR_PREFERENCES.capitalize,
    includeNumber:
      typeof candidate.includeNumber === "boolean"
        ? candidate.includeNumber
        : DEFAULT_USERNAME_GENERATOR_PREFERENCES.includeNumber,
  };
}

export function loadUsernameGeneratorPreferences(): UsernameGeneratorPreferences {
  try {
    return normalizeUsernameGeneratorPreferences(
      JSON.parse(window.localStorage.getItem(USERNAME_GENERATOR_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_USERNAME_GENERATOR_PREFERENCES };
  }
}

export function saveUsernameGeneratorPreferences(preferences: UsernameGeneratorPreferences): void {
  try {
    window.localStorage.setItem(USERNAME_GENERATOR_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* ignore */
  }
}

/**
 * Bitwarden-style random-word username.
 * When `includeNumber` is on, appends a 4-digit number (0000–9999).
 */
export function generateUsername(preferences: UsernameGeneratorPreferences): string {
  const word = EFF_LARGE_WORD_LIST[randomInt(EFF_LARGE_WORD_LIST.length)] ?? "okkey";
  const base = preferences.capitalize ? capitalizeWord(word) : word;
  if (!preferences.includeNumber) {
    return base;
  }
  const digits = String(randomInt(10000)).padStart(4, "0");
  return `${base}${digits}`;
}
