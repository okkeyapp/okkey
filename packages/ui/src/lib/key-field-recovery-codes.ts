export type KeyFieldRecoveryCode = {
  code: string;
  used: boolean;
};

export type KeyFieldRecoveryCodesValue = KeyFieldRecoveryCode[];

export const emptyKeyFieldRecoveryCodesValue = (): KeyFieldRecoveryCodesValue => [];

export function serializeKeyFieldRecoveryCodesValue(value: KeyFieldRecoveryCodesValue): string {
  return JSON.stringify(value);
}

export function parseKeyFieldRecoveryCodesValue(value: string): KeyFieldRecoveryCodesValue {
  const trimmed = value.trim();
  if (!trimmed) {
    return emptyKeyFieldRecoveryCodesValue();
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return emptyKeyFieldRecoveryCodesValue();
    }

    return parsed.flatMap((item): KeyFieldRecoveryCode[] => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const record = item as Partial<KeyFieldRecoveryCode>;
      if (typeof record.code !== "string") {
        return [];
      }

      const code = record.code.trim();
      if (!code) {
        return [];
      }

      return [{ code, used: Boolean(record.used) }];
    });
  } catch {
    return emptyKeyFieldRecoveryCodesValue();
  }
}

export function normalizeKeyFieldRecoveryCodesRows(value: KeyFieldRecoveryCodesValue): KeyFieldRecoveryCodesValue {
  return value.filter((item) => item.code.trim().length > 0);
}

export function withTrailingEmptyRecoveryCodeRow(value: KeyFieldRecoveryCodesValue): KeyFieldRecoveryCodesValue {
  const normalized = normalizeKeyFieldRecoveryCodesRows(value);
  if (normalized.length === 0) {
    return [{ code: "", used: false }];
  }

  const last = normalized[normalized.length - 1]!;
  if (last.code.trim()) {
    return [...normalized, { code: "", used: false }];
  }

  return normalized;
}

export function normalizeRecoveryCodeEditorRows(rows: KeyFieldRecoveryCodesValue): KeyFieldRecoveryCodesValue {
  return withTrailingEmptyRecoveryCodeRow(rows.filter((row) => row.code.trim().length > 0));
}

export function normalizeRecoveryCodesEditorText(text: string): string {
  const parts = text.split("\n");
  if (parts.length <= 1) {
    return text;
  }

  while (parts.length > 1 && parts[parts.length - 1] === "" && parts[parts.length - 2] === "") {
    parts.pop();
  }

  return parts.join("\n");
}

export function buildKeyFieldRecoveryCodeUsedLookup(previous: KeyFieldRecoveryCodesValue): Map<string, boolean> {
  const usedByCode = new Map<string, boolean>();

  for (const item of previous) {
    const trimmedCode = item.code.trim();
    if (!trimmedCode || usedByCode.has(trimmedCode)) {
      continue;
    }

    usedByCode.set(trimmedCode, item.used);
  }

  return usedByCode;
}

export function mergeKeyFieldRecoveryCodesEditorLines(
  lineTexts: readonly string[],
  previous: KeyFieldRecoveryCodesValue,
): KeyFieldRecoveryCodesValue {
  const usedByCode = buildKeyFieldRecoveryCodeUsedLookup(previous);

  return lineTexts.map((code) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      return { code, used: false };
    }

    return { code, used: usedByCode.get(trimmedCode) ?? false };
  });
}

export function splitRecoveryCodesPasteText(text: string): string[] {
  return text
    .split(/[,\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function transformKeyFieldRecoveryCodesInput(value: string): string {
  return splitRecoveryCodesPasteText(value).join("\n");
}

export function getKeyFieldRecoveryCodesUsedCount(value: KeyFieldRecoveryCodesValue): number {
  return value.filter((item) => item.used).length;
}

export function getKeyFieldRecoveryCodesRemainingCount(value: KeyFieldRecoveryCodesValue): number {
  return value.filter((item) => !item.used).length;
}

export function getFirstUnusedKeyFieldRecoveryCode(value: KeyFieldRecoveryCodesValue): string | undefined {
  return value.find((item) => !item.used)?.code;
}

export function resetKeyFieldRecoveryCodesUsedState(value: KeyFieldRecoveryCodesValue): KeyFieldRecoveryCodesValue {
  return value.map((item) => ({ ...item, used: false }));
}

export function markFirstUnusedKeyFieldRecoveryCodeUsed(value: KeyFieldRecoveryCodesValue): KeyFieldRecoveryCodesValue {
  const firstUnusedIndex = value.findIndex((item) => !item.used);
  if (firstUnusedIndex === -1) {
    return value;
  }

  return value.map((item, index) => (index === firstUnusedIndex ? { ...item, used: true } : item));
}

export function setKeyFieldRecoveryCodeUsed(
  value: KeyFieldRecoveryCodesValue,
  index: number,
  used: boolean,
): KeyFieldRecoveryCodesValue {
  if (index < 0 || index >= value.length) {
    return value;
  }

  return value.map((item, itemIndex) => (itemIndex === index ? { ...item, used } : item));
}

export const keyFieldRecoveryCodesConcealedLine = "••••••••••";
