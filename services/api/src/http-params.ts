import { isEntityId } from "./entity-id.ts";

/**
 * Path param names that are Postgres `bigint` / snowflake entity ids.
 * Includes WebAuthn credential *row* id (`user_webauthn_credentials.id`), not the
 * authenticator credential handle stored in `credential_id` text.
 */
export const ENTITY_ID_PATH_PARAM_NAMES = new Set([
  "workspaceId",
  "vaultId",
  "itemId",
  "attachmentId",
  "capsuleId",
  "templateId",
  "roleId",
  "profileId",
  "invitationId",
  "userId",
  "deviceId",
  "contactId",
  "inviteId",
  "requestId",
  "credentialId",
]);

export type InvalidEntityIdParam = {
  name: string;
  value: string;
};

/**
 * Returns the first path param that should be an entity id but fails {@link isEntityId}.
 * Empty values are treated as invalid (route matching already requires a segment).
 * Surrounding whitespace is rejected (value is trimmed only for the check; use
 * {@link normalizeEntityIdPathParams} to forward the trimmed form to handlers).
 */
export function findInvalidEntityIdPathParam(
  params: Record<string, string>,
): InvalidEntityIdParam | null {
  for (const name of ENTITY_ID_PATH_PARAM_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      continue;
    }
    const raw = params[name] ?? "";
    const value = raw.trim();
    // Reject surrounding whitespace even when the trimmed form would be valid.
    if (raw !== value || !isEntityId(value)) {
      return { name, value: raw };
    }
  }
  return null;
}

/** Rewrite entity-id path params to their trimmed form for downstream handlers. */
export function normalizeEntityIdPathParams(
  params: Record<string, string>,
): Record<string, string> {
  const next = { ...params };
  for (const name of ENTITY_ID_PATH_PARAM_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(next, name)) {
      continue;
    }
    next[name] = next[name].trim();
  }
  return next;
}

/** Error code for an invalid path entity id (`vaultId` → `INVALID_VAULT_ID`). */
export function invalidEntityIdErrorCode(paramName: string): string {
  const snake = paramName
    .replace(/([A-Z])/g, "_$1")
    .replace(/^_/, "")
    .toUpperCase();
  return `INVALID_${snake}`;
}

/**
 * Normalize an optional body/query entity id.
 * - `undefined` / missing → `undefined` (field omitted)
 * - `null` or blank string → `null` (explicit clear)
 * - non-empty invalid → `invalid`
 * - valid snowflake → the trimmed id
 */
export function parseOptionalEntityId(
  value: unknown,
): { kind: "omitted" } | { kind: "clear" } | { kind: "value"; id: string } | { kind: "invalid" } {
  if (value === undefined) {
    return { kind: "omitted" };
  }
  if (value === null) {
    return { kind: "clear" };
  }
  if (typeof value !== "string") {
    return { kind: "invalid" };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: "clear" };
  }
  if (!isEntityId(trimmed)) {
    return { kind: "invalid" };
  }
  return { kind: "value", id: trimmed };
}
