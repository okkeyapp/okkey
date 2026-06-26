import { createEntityIdGenerator } from "../../../packages/id/dist/index.js";

/** Dedicated node id for API integration tests (isolated from server node 1). */
const testGenerator = createEntityIdGenerator(900);

export function testEntityId(): string {
  return testGenerator.next();
}
