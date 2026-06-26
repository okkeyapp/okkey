export type { EntityId } from "./entity-id.js";
export {
  ENTITY_ID_RE,
  assertEntityId,
  entityIdFromDb,
  isEntityId,
} from "./entity-id.js";
export { SnowflakeGenerator } from "./snowflake.js";

import { SnowflakeGenerator } from "./snowflake.js";

let defaultGenerator: SnowflakeGenerator | undefined;

/** Configure the process-wide generator (API server, tests). Call once at startup. */
export function configureEntityIdGenerator(nodeId: number): void {
  defaultGenerator = new SnowflakeGenerator(nodeId);
}

/** Returns a new snowflake id using the configured generator. */
export function generateEntityId(): string {
  if (!defaultGenerator) {
    defaultGenerator = new SnowflakeGenerator(1);
  }
  return defaultGenerator.next();
}

/** Isolated generator for unit tests (avoids shared sequence state). */
export function createEntityIdGenerator(nodeId: number): SnowflakeGenerator {
  return new SnowflakeGenerator(nodeId);
}
