import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldRunBackgroundJobsInApiProcess,
  startBackgroundJobs,
} from "../src/jobs/background-jobs.ts";

test("shouldRunBackgroundJobsInApiProcess defaults off in production", () => {
  assert.equal(shouldRunBackgroundJobsInApiProcess("production", undefined), false);
  assert.equal(shouldRunBackgroundJobsInApiProcess("development", undefined), true);
  assert.equal(shouldRunBackgroundJobsInApiProcess("production", "true"), true);
  assert.equal(shouldRunBackgroundJobsInApiProcess("development", "false"), false);
});

test("startBackgroundJobs invokes purge loops and stop clears timers", async () => {
  let itemRuns = 0;
  let capsuleRuns = 0;
  const logs: string[] = [];

  const handles = startBackgroundJobs({
    itemPurgeService: {
      purgeExpiredSoftDeletes: async () => {
        itemRuns += 1;
        return 0;
      },
    },
    capsuleService: {
      purgeDueCapsules: async () => {
        capsuleRuns += 1;
        return 0;
      },
    },
    logger: {
      info: (message) => {
        logs.push(message);
      },
      error: () => {},
    },
    itemPurgeIntervalMs: 60_000,
    capsuleCleanupIntervalMs: 60_000,
    runImmediately: true,
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(itemRuns >= 1);
  assert.ok(capsuleRuns >= 1);
  assert.ok(logs.some((line) => line.includes("background jobs started")));

  handles.stop();
  assert.ok(logs.some((line) => line.includes("background jobs stopped")));
});
