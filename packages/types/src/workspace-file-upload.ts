export const DEFAULT_ALLOWED_FILE_EXTENSIONS = ["jpg", "png", "pdf", "zip", "rar"] as const;

export const DEFAULT_MAX_FILE_SIZE_MB = 2 as const;

export const MIN_MAX_FILE_SIZE_MB = 1 as const;

export const MAX_MAX_FILE_SIZE_MB = 1024 as const;

export function normalizeFileExtensionTag(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function normalizeAllowedFileExtensions(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const normalized = normalizeFileExtensionTag(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function normalizeMaxFileSizeMbInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatMaxFileSizeMb(value: number): string {
  return String(Math.trunc(value));
}

export function parseMaxFileSizeMbFromInput(raw: string): number | null {
  const normalized = normalizeMaxFileSizeMbInput(raw.trim());
  if (!normalized) {
    return null;
  }

  const value = Number(normalized);
  if (!Number.isInteger(value)) {
    return null;
  }

  if (value < MIN_MAX_FILE_SIZE_MB || value > MAX_MAX_FILE_SIZE_MB) {
    return null;
  }

  return value;
}

export function clampMaxFileSizeMb(value: number): number {
  if (value < MIN_MAX_FILE_SIZE_MB) {
    return MIN_MAX_FILE_SIZE_MB;
  }
  if (value > MAX_MAX_FILE_SIZE_MB) {
    return MAX_MAX_FILE_SIZE_MB;
  }
  return value;
}

export function resolveMaxFileSizeMbFromInput(raw: string): number {
  const normalized = normalizeMaxFileSizeMbInput(raw.trim());
  if (!normalized) {
    return MIN_MAX_FILE_SIZE_MB;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return MIN_MAX_FILE_SIZE_MB;
  }

  return clampMaxFileSizeMb(Math.trunc(value));
}

export function maxFileSizeBytesFromMb(maxFileSizeMb: number): number {
  return maxFileSizeMb * 1024 * 1024;
}
