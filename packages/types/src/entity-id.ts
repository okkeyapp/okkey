import type { EntityId } from "@okkey/id";

export type { EntityId } from "@okkey/id";
export {
  ENTITY_ID_RE,
  assertEntityId,
  entityIdFromDb,
  generateEntityId,
  isEntityId,
} from "@okkey/id";

/** @deprecated Use {@link EntityId} */
export type UUID = EntityId;
