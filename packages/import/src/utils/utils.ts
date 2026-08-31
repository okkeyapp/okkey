export function isNullOrWhitespace(str: string | undefined | null): boolean {
  return str == null || str.trim() === "";
}

export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Normalize 2-digit or 4-digit card expiry year to 4 digits. */
export function normalizeExpiryYearFormat(year: string): string {
  const trimmed = year.trim();
  if (trimmed.length === 2) {
    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isNaN(numeric)) {
      return trimmed;
    }
    return numeric >= 70 ? `19${trimmed}` : `20${trimmed}`;
  }
  return trimmed;
}

export const Utils = {
  isNullOrWhitespace,
  getHostname,
};
