import { format, isValid, parse } from "date-fns";

export const keyFieldDateDisplayFormat = "dd.MM.yyyy";

const keyFieldDateInputFormats = [keyFieldDateDisplayFormat, "yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"] as const;

export function formatKeyFieldDateValue(date: Date): string {
  return format(date, keyFieldDateDisplayFormat);
}

export function parseKeyFieldDateValue(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  for (const pattern of keyFieldDateInputFormats) {
    const parsed = parse(trimmed, pattern, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const fallback = new Date(trimmed);
  return isValid(fallback) ? fallback : undefined;
}

export function isValidKeyFieldDateValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  return parseKeyFieldDateValue(trimmed) !== undefined;
}
