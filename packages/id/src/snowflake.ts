import type { EntityId } from "./entity-id.js";

/** Custom epoch: 2024-01-01T00:00:00.000Z */
const SNOWFLAKE_EPOCH_MS = 1_704_067_200_000n;

const MAX_NODE_ID = 1023;
const MAX_SEQUENCE = 4095n;

const TIMESTAMP_SHIFT = 22n;
const NODE_SHIFT = 12n;

export class SnowflakeGenerator {
  private lastTimestamp = -1n;
  private sequence = 0n;

  constructor(private readonly nodeId: number) {
    if (!Number.isInteger(nodeId) || nodeId < 0 || nodeId > MAX_NODE_ID) {
      throw new Error(`snowflake nodeId must be an integer 0..${MAX_NODE_ID}`);
    }
  }

  next(): EntityId {
    let timestamp = BigInt(Date.now()) - SNOWFLAKE_EPOCH_MS;
    if (timestamp < this.lastTimestamp) {
      throw new Error("snowflake clock moved backwards");
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        timestamp = this.waitNextMillis(this.lastTimestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    const id =
      (timestamp << TIMESTAMP_SHIFT) |
      (BigInt(this.nodeId) << NODE_SHIFT) |
      this.sequence;

    return id.toString();
  }

  private waitNextMillis(last: bigint): bigint {
    let ts = BigInt(Date.now()) - SNOWFLAKE_EPOCH_MS;
    while (ts <= last) {
      ts = BigInt(Date.now()) - SNOWFLAKE_EPOCH_MS;
    }
    return ts;
  }
}
