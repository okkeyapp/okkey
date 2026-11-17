import { describe, expect, it } from "vitest";

import { waitForRunningCore } from "./wait-for-core";

function clocked() {
  let clock = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
}

describe("waitForRunningCore", () => {
  it("waits with backoff until the running core reports the target version", async () => {
    const versions = ["1.0.0", "1.0.0", "2.0.0"];
    const reads: number[] = [];
    const time = clocked();
    const result = await waitForRunningCore(
      "2.0.0",
      async () => {
        reads.push(time.now());
        return versions.shift() ?? "1.0.0";
      },
      { timeoutMs: 60_000, ...time },
    );
    expect(result).toBe("ready");
    expect(reads).toEqual([0, 1_000, 3_000]);
    expect(time.sleeps).toEqual([1_000, 2_000]);
  });

  it("treats a down API as not ready and does not call it again immediately", async () => {
    let reads = 0;
    const time = clocked();
    const result = await waitForRunningCore(
      "2.0.0",
      async () => {
        reads += 1;
        if (reads < 3) {
          throw new Error("connection refused");
        }
        return "2.0.0";
      },
      { timeoutMs: 60_000, ...time },
    );
    expect(result).toBe("ready");
    expect(reads).toBe(3);
    expect(time.sleeps).toEqual([1_000, 2_000]);
  });

  it("stops before enterprise when the core never reports the target version", async () => {
    let reads = 0;
    const time = clocked();
    const result = await waitForRunningCore(
      "2.0.0",
      async () => {
        reads += 1;
        return "1.0.0";
      },
      { timeoutMs: 10_000, ...time },
    );
    expect(result).toBe("timeout");
    expect(reads).toBe(4);
    expect(time.sleeps).toEqual([1_000, 2_000, 4_000, 3_000]);
    expect(Math.max(...time.sleeps)).toBeLessThanOrEqual(8_000);
  });
});
