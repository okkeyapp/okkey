import type { EntityId } from "@okkey/id";

export type { EntityId } from "@okkey/id";
export {
  ENTITY_ID_RE,
  MAX_ENTITY_ID,
  assertEntityId,
  entityIdFromDb,
  generateEntityId,
  isEntityId,
} from "@okkey/id";

/** @deprecated Use {@link EntityId} */
export type UUID = EntityId;
