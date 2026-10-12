export type PasswordGeneratorSettings = {
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
};

export type PasswordGeneratorPreferences = PasswordGeneratorSettings & {
  length: number;
};

export const DEFAULT_PASSWORD_GENERATOR_SETTINGS: PasswordGeneratorSettings = {
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: false,
};

export const DEFAULT_PASSWORD_GENERATOR_LENGTH = 16;

export const PASSWORD_GENERATOR_STORAGE_KEY = "okkey.devUi.passwordGenerator";

export const PASSWORD_GENERATOR_CHARACTER_SETS: Record<keyof PasswordGeneratorSettings, string> = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*",
};

export const PASSWORD_GENERATOR_LENGTH_MIN = 4;
export const PASSWORD_GENERATOR_LENGTH_MAX = 128;

export function normalizePasswordGeneratorPreferences(value: unknown): PasswordGeneratorPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PASSWORD_GENERATOR_SETTINGS, length: DEFAULT_PASSWORD_GENERATOR_LENGTH };
  }

  const candidate = value as Partial<Record<keyof PasswordGeneratorPreferences, unknown>>;
  const settings: PasswordGeneratorSettings = {
    uppercase:
      typeof candidate.uppercase === "boolean"
        ? candidate.uppercase
        : DEFAULT_PASSWORD_GENERATOR_SETTINGS.uppercase,
    lowercase:
      typeof candidate.lowercase === "boolean"
        ? candidate.lowercase
        : DEFAULT_PASSWORD_GENERATOR_SETTINGS.lowercase,
    numbers:
      typeof candidate.numbers === "boolean"
        ? candidate.numbers
        : DEFAULT_PASSWORD_GENERATOR_SETTINGS.numbers,
    symbols:
      typeof candidate.symbols === "boolean"
        ? candidate.symbols
        : DEFAULT_PASSWORD_GENERATOR_SETTINGS.symbols,
  };

  if (!settings.uppercase && !settings.lowercase && !settings.numbers && !settings.symbols) {
    settings.lowercase = true;
  }

  const length =
    typeof candidate.length === "number" ? candidate.length : DEFAULT_PASSWORD_GENERATOR_LENGTH;

  return {
    ...settings,
    length: Math.min(
      PASSWORD_GENERATOR_LENGTH_MAX,
      Math.max(PASSWORD_GENERATOR_LENGTH_MIN, Math.round(length)),
    ),
  };
}

export function loadPasswordGeneratorPreferences(): PasswordGeneratorPreferences {
  try {
    return normalizePasswordGeneratorPreferences(
      JSON.parse(window.localStorage.getItem(PASSWORD_GENERATOR_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return { ...DEFAULT_PASSWORD_GENERATOR_SETTINGS, length: DEFAULT_PASSWORD_GENERATOR_LENGTH };
  }
}

export function savePasswordGeneratorPreferences(preferences: PasswordGeneratorPreferences): void {
  try {
    window.localStorage.setItem(PASSWORD_GENERATOR_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* ignore */
  }
}

/** Cryptographically random password with at least one char from each enabled set. */
export function generatePassword(settings: PasswordGeneratorSettings, length: number): string {
  const enabledSets = (Object.keys(settings) as Array<keyof PasswordGeneratorSettings>)
    .filter((key) => settings[key])
    .map((key) => PASSWORD_GENERATOR_CHARACTER_SETS[key]);
  const pool = enabledSets.join("");

  if (!pool) {
    return "";
  }

  const targetLength = Math.max(length, enabledSets.length);
  const values = new Uint32Array(targetLength);
  window.crypto.getRandomValues(values);
  const requiredCharacters = enabledSets.map((set, index) => set[values[index] % set.length]!);
  const remainingCharacters = Array.from(
    values.slice(enabledSets.length),
    (value) => pool[value % pool.length]!,
  );
  const characters = [...requiredCharacters, ...remainingCharacters];

  const shuffleValues = new Uint32Array(characters.length);
  window.crypto.getRandomValues(shuffleValues);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = shuffleValues[index]! % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex]!, characters[index]!];
  }

  return characters.join("");
}

export type GeneratedPasswordCharKind = "letter" | "number" | "symbol";

export function getGeneratedPasswordCharKind(character: string): GeneratedPasswordCharKind {
  if (/\d/.test(character)) {
    return "number";
  }
  if (PASSWORD_GENERATOR_CHARACTER_SETS.symbols.includes(character)) {
    return "symbol";
  }
  return "letter";
}
