import { configureEntityIdGenerator, generateEntityId as nextEntityId } from "../../../packages/id/dist/index.js";

let configured = false;

export function initEntityIdGenerator(nodeId: number): void {
  configureEntityIdGenerator(nodeId);
  configured = true;
}

export function generateEntityId(): string {
  if (!configured) {
    configureEntityIdGenerator(1);
    configured = true;
  }
  return nextEntityId();
}

export { entityIdFromDb, isEntityId } from "../../../packages/id/dist/index.js";
