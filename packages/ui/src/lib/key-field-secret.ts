export type KeyFieldSecretKind = "password" | "single-line" | "multi-line";

export type KeyFieldSecretRaw = {
  secretKind: KeyFieldSecretKind;
  value: string;
};

const DEFAULT_SECRET_KIND: KeyFieldSecretKind = "password";

function isSecretKind(value: unknown): value is KeyFieldSecretKind {
  return value === "password" || value === "single-line" || value === "multi-line";
}

export function parseKeyFieldSecretRaw(raw: unknown): KeyFieldSecretRaw | null {
  if (typeof raw === "string") {
    try {
      return parseKeyFieldSecretRaw(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Partial<KeyFieldSecretRaw>;
  if (!isSecretKind(record.secretKind) || typeof record.value !== "string") {
    return null;
  }

  return {
    secretKind: record.secretKind,
    value: record.value,
  };
}

export function serializeKeyFieldSecretRaw(secretKind: KeyFieldSecretKind, value: string): KeyFieldSecretRaw {
  return {
    secretKind,
    value,
  };
}

export function coerceSecretRawToFormValue(raw: unknown): string {
  return parseKeyFieldSecretRaw(raw)?.value ?? "";
}

export function getSecretKindFromRaw(raw: unknown): KeyFieldSecretKind {
  return parseKeyFieldSecretRaw(raw)?.secretKind ?? DEFAULT_SECRET_KIND;
}
