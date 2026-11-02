/** Decimal snowflake string (never use JS `number` — exceeds MAX_SAFE_INTEGER over time). */
export type EntityId = string;

/**
 * Digit shape for entity ids (10–20 decimal digits).
 * Prefer {@link isEntityId} for validation: Postgres stores ids as signed `bigint`
 * (int8), so values above 2^63-1 must be rejected even when the digit shape matches.
 */
export const ENTITY_ID_RE = /^\d{10,20}$/;

/** Postgres `bigint` / signed int64 maximum (2^63 - 1). */
export const MAX_ENTITY_ID = (1n << 63n) - 1n;

export function isEntityId(value: string): boolean {
  if (!ENTITY_ID_RE.test(value)) {
    return false;
  }
  // No leading zeros; numeric value must fit signed int64 (Postgres bigint).
  if (value.startsWith("0")) {
    return false;
  }
  try {
    return BigInt(value) <= MAX_ENTITY_ID;
  } catch {
    return false;
  }
}

export function assertEntityId(value: string, label = "id"): EntityId {
  if (!isEntityId(value)) {
    throw new Error(`${label} must be a decimal entity id`);
  }
  return value;
}

/** Normalize DB driver output (pg may return bigint as string). */
export function entityIdFromDb(value: string | number | bigint): EntityId {
  const s = String(value);
  if (!isEntityId(s)) {
    throw new Error(`invalid entity id from database: ${s}`);
  }
  return s;
}
