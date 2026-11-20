import test from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_APPROVAL_PICKUP_ALARM,
  PENDING_APPROVAL_PICKUP_BASE_MS,
  PENDING_APPROVAL_PICKUP_MAX_MS,
  nextPendingApprovalBackoffMs,
  pendingApprovalOutcomeFromTrustStatus,
  pendingApprovalPickupContinues,
  runPendingApprovalPickupTick,
  schedulePendingApprovalPickupAlarm,
  type PendingApprovalPickupOutcome,
} from "./pendingApprovalPickup.ts";

test("nextPendingApprovalBackoffMs doubles then caps", () => {
  assert.equal(nextPendingApprovalBackoffMs(0), PENDING_APPROVAL_PICKUP_BASE_MS);
  assert.equal(nextPendingApprovalBackoffMs(1), PENDING_APPROVAL_PICKUP_BASE_MS * 2);
  assert.equal(nextPendingApprovalBackoffMs(2), PENDING_APPROVAL_PICKUP_BASE_MS * 4);
  assert.equal(nextPendingApprovalBackoffMs(10), PENDING_APPROVAL_PICKUP_MAX_MS);
  assert.equal(nextPendingApprovalBackoffMs(-1), PENDING_APPROVAL_PICKUP_BASE_MS);
});

test("pendingApprovalPickupContinues only while still waiting", () => {
  assert.equal(pendingApprovalPickupContinues("pending"), true);
  assert.equal(pendingApprovalPickupContinues("checking"), true);
  assert.equal(pendingApprovalPickupContinues("trusted"), false);
  assert.equal(pendingApprovalPickupContinues("rejected"), false);
  assert.equal(pendingApprovalPickupContinues("blocked"), false);
  assert.equal(pendingApprovalPickupContinues("error"), false);
});

test("pendingApprovalOutcomeFromTrustStatus maps poll results", () => {
  assert.equal(pendingApprovalOutcomeFromTrustStatus("trusted"), "trusted");
  assert.equal(pendingApprovalOutcomeFromTrustStatus("pending"), "pending");
  assert.equal(pendingApprovalOutcomeFromTrustStatus("rejected"), "rejected");
  assert.equal(pendingApprovalOutcomeFromTrustStatus("blocked"), "blocked");
  assert.equal(pendingApprovalOutcomeFromTrustStatus("error"), "idle");
});

test("schedulePendingApprovalPickupAlarm clears when pickup should stop", async () => {
  const created: Array<{ name: string; when: number }> = [];
  let cleared = 0;
  const alarms = {
    create(name: string, info: { when: number }) {
      created.push({ name, when: info.when });
    },
    clear() {
      cleared += 1;
      return true;
    },
  };
  const now = () => 1_000_000;

  for (const outcome of ["trusted", "rejected", "blocked", "idle"] as PendingApprovalPickupOutcome[]) {
    cleared = 0;
    created.length = 0;
    const delay = await schedulePendingApprovalPickupAlarm(alarms, outcome, 0, now);
    assert.equal(delay, null);
    assert.equal(cleared, 1);
    assert.equal(created.length, 0);
  }
});

test("schedulePendingApprovalPickupAlarm keeps polling on pending and error", async () => {
  const created: Array<{ name: string; when: number }> = [];
  const alarms = {
    create(name: string, info: { when: number }) {
      created.push({ name, when: info.when });
    },
    clear() {
      return true;
    },
  };
  const now = () => 5_000;

  const pendingDelay = await schedulePendingApprovalPickupAlarm(alarms, "pending", 1, now);
  assert.equal(pendingDelay, PENDING_APPROVAL_PICKUP_BASE_MS * 2);
  assert.deepEqual(created[0], {
    name: PENDING_APPROVAL_PICKUP_ALARM,
    when: 5_000 + PENDING_APPROVAL_PICKUP_BASE_MS * 2,
  });

  created.length = 0;
  const errorDelay = await schedulePendingApprovalPickupAlarm(alarms, "error", 0, now);
  assert.equal(errorDelay, PENDING_APPROVAL_PICKUP_BASE_MS);
  assert.equal(created[0]?.name, PENDING_APPROVAL_PICKUP_ALARM);
});

test("runPendingApprovalPickupTick is idle without session", async () => {
  const outcome = await runPendingApprovalPickupTick({
    readSession: async () => null,
    readProfile: async () => ({ apiBaseUrl: "https://api.example" }),
    readDeviceId: async () => "dev-1",
    readDeviceFingerprint: async () => "fp",
    hasShareDeliveryKey: async () => true,
    poll: async () => {
      throw new Error("poll must not run");
    },
  });
  assert.equal(outcome, "idle");
});

test("runPendingApprovalPickupTick claims via injected poll while pending", async () => {
  let pollCalls = 0;
  const pending = await runPendingApprovalPickupTick({
    readSession: async () => ({ access_token: "tok", user_id: "u1" }),
    readProfile: async () => ({ apiBaseUrl: "https://api.example" }),
    readDeviceId: async () => "dev-1",
    readDeviceFingerprint: async () => "fp",
    hasShareDeliveryKey: async () => true,
    poll: async (apiBaseUrl, accessToken, pendingDeviceId) => {
      pollCalls += 1;
      assert.equal(apiBaseUrl, "https://api.example");
      assert.equal(accessToken, "tok");
      assert.equal(pendingDeviceId, "dev-1");
      return { status: "pending" };
    },
  });
  assert.equal(pending, "pending");
  assert.equal(pollCalls, 1);

  const trusted = await runPendingApprovalPickupTick({
    readSession: async () => ({ access_token: "tok", user_id: "u1" }),
    readProfile: async () => ({ apiBaseUrl: "https://api.example" }),
    readDeviceId: async () => "dev-1",
    readDeviceFingerprint: async () => "fp",
    hasShareDeliveryKey: async () => true,
    poll: async () => ({ status: "trusted" }),
  });
  assert.equal(trusted, "trusted");
});

test("runPendingApprovalPickupTick does not poll without device id or delivery key", async () => {
  let pollCalls = 0;
  const outcome = await runPendingApprovalPickupTick({
    readSession: async () => ({ access_token: "tok", user_id: "u1" }),
    readProfile: async () => ({ apiBaseUrl: "https://api.example" }),
    readDeviceId: async () => null,
    readDeviceFingerprint: async () => "fp",
    hasShareDeliveryKey: async () => false,
    poll: async () => {
      pollCalls += 1;
      return { status: "pending" };
    },
  });
  assert.equal(outcome, "idle");
  assert.equal(pollCalls, 0);
});
