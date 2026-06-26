/** Decimal snowflake string (never use JS `number` — exceeds MAX_SAFE_INTEGER over time). */
export type EntityId = string;

/** Snowflake IDs are 64-bit unsigned integers rendered as decimal strings. */
export const ENTITY_ID_RE = /^\d{10,20}$/;

export function isEntityId(value: string): boolean {
  return ENTITY_ID_RE.test(value);
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
