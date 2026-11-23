/** Setup codes are 16 hex chars (displayed as 4×4 groups). */
export const SETUP_CODE_LENGTH = 16;
export const SETUP_CODE_GROUP_SIZE = 4;
export const SETUP_CODE_GROUP_COUNT = SETUP_CODE_LENGTH / SETUP_CODE_GROUP_SIZE;

export function normalizeSetupCodeHex(raw: string): string {
  return raw.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, SETUP_CODE_LENGTH);
}

/** Format joined hex as a1b2-c3d4-e5f6-7890 for the verify API. */
export function formatSetupCodeGroups(hex: string): string {
  const normalized = normalizeSetupCodeHex(hex);
  const parts: string[] = [];
  for (let i = 0; i < SETUP_CODE_GROUP_COUNT; i += 1) {
    const slice = normalized.slice(i * SETUP_CODE_GROUP_SIZE, (i + 1) * SETUP_CODE_GROUP_SIZE);
    if (slice) {
      parts.push(slice);
    }
  }
  return parts.join("-");
}
