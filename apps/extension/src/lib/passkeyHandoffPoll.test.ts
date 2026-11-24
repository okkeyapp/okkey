import test from "node:test";
import assert from "node:assert/strict";

import {
  pollPasskeyHandoffUntilDone,
  type PasskeyHandoffPollStatus,
} from "./passkeyHandoffPoll.ts";

function clock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

async function pollSequence(statuses: PasskeyHandoffPollStatus[]) {
  const time = clock();
  let index = 0;
  const result = await pollPasskeyHandoffUntilDone({
    intervalMs: 2_000,
    timeoutMs: 20_000,
    now: time.now,
    sleep: time.sleep,
    read: async () => {
      const status = statuses[index] ?? statuses[statuses.length - 1]!;
      index += 1;
      return status;
    },
  });
  return { result, reads: index, elapsed: time.now() };
}

test("passkey handoff poll returns confirmed", async () => {
  const { result, reads, elapsed } = await pollSequence(["pending", "pending", "confirmed"]);
  assert.equal(result, "confirmed");
  assert.equal(reads, 3);
  assert.equal(elapsed, 4_000);
});

test("passkey handoff poll returns rejected", async () => {
  const { result, reads, elapsed } = await pollSequence(["rejected"]);
  assert.equal(result, "rejected");
  assert.equal(reads, 1);
  assert.equal(elapsed, 0);
});

test("passkey handoff poll returns expired", async () => {
  const { result, reads, elapsed } = await pollSequence(["pending", "expired"]);
  assert.equal(result, "expired");
  assert.equal(reads, 2);
  assert.equal(elapsed, 2_000);
});

test("passkey handoff poll returns timeout while status stays pending", async () => {
  const time = clock();
  const reads: number[] = [];
  const result = await pollPasskeyHandoffUntilDone({
    intervalMs: 2_000,
    timeoutMs: 5_000,
    now: time.now,
    sleep: time.sleep,
    read: async () => {
      reads.push(time.now());
      return "pending";
    },
  });
  assert.equal(result, "timeout");
  assert.deepEqual(reads, [0, 2_000, 4_000]);
  assert.equal(time.now(), 5_000);
});
