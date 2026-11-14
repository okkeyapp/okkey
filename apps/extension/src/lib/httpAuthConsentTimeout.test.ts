import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  challengeIdFromHttpAuthAlarm,
  createHttpAuthConsentTracker,
  httpAuthPendingSession,
  parseHttpAuthPendingBag,
  type HttpAuthConsentPorts,
  type HttpAuthPendingSession,
} from "./httpAuthConsentTimeout.ts";
import type { HttpAuthConsentResult } from "./httpAuthMessages.ts";

const PASSWORD = "pw-do-not-log-9f3a";

type FakeTimer = {
  id: number;
  at: number;
  callback: () => void | Promise<void>;
  cleared: boolean;
};

function harness(session: Record<string, HttpAuthPendingSession>) {
  let now = 1_700_000_000_000;
  const timers: FakeTimer[] = [];
  const alarms = new Map<string, number>();
  const closed: number[] = [];
  const logs: string[] = [];
  let nextTimer = 1;

  const ports: HttpAuthConsentPorts = {
    now: () => now,
    setTimer(callback, delayMs) {
      const handle: FakeTimer = { id: nextTimer++, at: now + delayMs, callback, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimer(handle) {
      const timer = handle as FakeTimer;
      timer.cleared = true;
    },
    scheduleAlarm(challengeId, whenMs) {
      alarms.set(challengeId, whenMs);
    },
    clearAlarm(challengeId) {
      alarms.delete(challengeId);
    },
    closeWindow(windowId) {
      closed.push(windowId);
    },
    log(line) {
      logs.push(`[okkey] ${line}`);
    },
    async readPending() {
      return session;
    },
    async writePending(records) {
      for (const key of Object.keys(session)) {
        delete session[key];
      }
      Object.assign(session, records);
    },
  };

  return {
    ports,
    tracker: createHttpAuthConsentTracker(ports),
    logs,
    closed,
    alarms,
    jump(ms: number) {
      now += ms;
    },
    async fireDue() {
      const due = timers.filter((timer) => !timer.cleared && timer.at <= now);
      for (const timer of due) {
        timer.cleared = true;
        await timer.callback();
      }
    },
    /** Invoke the live one-shot timer even though the clock has not reached it. */
    async fireLiveTimerEarly() {
      const timer = timers.find((entry) => !entry.cleared);
      if (!timer) {
        throw new Error("no live timer");
      }
      timer.cleared = true;
      await timer.callback();
    },
    liveTimers() {
      return timers.filter((timer) => !timer.cleared);
    },
  };
}

describe("http auth consent timeout", () => {
  it("drops credentials from the persisted deadline record", () => {
    const stored = httpAuthPendingSession({
      deadlineMs: 10,
      windowId: 4,
      origin: "https://127.0.0.1:8443",
      password: PASSWORD,
      username: "ada",
      authorization: "Basic secret",
    });
    assert.deepEqual(stored, {
      deadlineMs: 10,
      windowId: 4,
      origin: "https://127.0.0.1:8443",
    });
    const parsed = parseHttpAuthPendingBag({
      challenge: { ...stored, password: PASSWORD, authorization: "Basic secret" },
    });
    assert.equal(JSON.stringify(parsed).includes(PASSWORD), false);
    assert.equal(JSON.stringify(parsed).toLowerCase().includes("authorization"), false);
  });

  it("resolves timeout when the in-memory timer is lost and the page wakes late", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const clock = harness(session);
    const results: HttpAuthConsentResult[] = [];
    const deadline = await clock.tracker.open({
      challengeId: "c1",
      origin: "https://127.0.0.1:8443",
      resolve: (result) => results.push(result),
    });
    await clock.tracker.attachWindow("c1", 42);
    assert.equal(JSON.stringify(session).includes(PASSWORD), false);
    assert.equal(JSON.stringify(session).includes("password"), false);
    clock.jump(97_000);
    assert.equal(clock.liveTimers().length, 1);
    await clock.tracker.restoreLostTimers();
    assert.deepEqual(results, [{ outcome: "timeout" }]);
    assert.deepEqual(clock.closed, [42]);
    assert.equal(session.c1, undefined);
    assert.equal(clock.alarms.has("c1"), false);
    assert.equal(deadline <= 1_700_000_000_000 + 90_000, true);
    assert.equal(JSON.stringify(session).includes(PASSWORD), false);
  });

  it("logs the timeout and closes the window after a background restart", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const first = harness(session);
    await first.tracker.open({
      challengeId: "c1",
      origin: "https://127.0.0.1:8443",
      resolve: () => undefined,
    });
    await first.tracker.attachWindow("c1", 7);
    const restarted = harness(session);
    restarted.jump(97_000);
    await restarted.tracker.restoreLostTimers();
    assert.equal(restarted.logs.some((line) => line.includes("[okkey] http-auth timeout")), true);
    assert.equal(restarted.logs.some((line) => line.includes("origin=https://127.0.0.1:8443")), true);
    assert.equal(restarted.logs.join("\n").includes(PASSWORD), false);
    assert.deepEqual(restarted.closed, [7]);
    assert.equal(session.c1, undefined);
  });

  it("does not time out when an alarm arrives before the deadline", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const clock = harness(session);
    const results: HttpAuthConsentResult[] = [];
    await clock.tracker.open({
      challengeId: "c1",
      origin: "https://files.example",
      resolve: (result) => results.push(result),
    });
    const deadline = clock.alarms.get("c1");
    clock.jump(10_000);
    assert.equal(await clock.tracker.onAlarm("c1"), "pending");
    assert.deepEqual(results, []);
    assert.equal(session.c1?.origin, "https://files.example");
    assert.equal(clock.alarms.get("c1"), deadline);
    assert.equal(clock.liveTimers().length, 1);
    assert.equal(clock.liveTimers()[0]?.at, deadline);
    clock.jump(80_000);
    assert.equal(await clock.tracker.onAlarm("c1"), "expired");
    assert.deepEqual(results, [{ outcome: "timeout" }]);
    assert.equal(clock.liveTimers().length, 0);
  });

  it("rejects a late confirm and clears a decline before a later wake", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const clock = harness(session);
    const results: HttpAuthConsentResult[] = [];
    await clock.tracker.open({
      challengeId: "late",
      origin: "https://files.example",
      resolve: (result) => results.push(result),
    });
    clock.jump(97_000);
    assert.equal(await clock.tracker.onActivity("late"), "expired");
    assert.equal(
      await clock.tracker.finish("late", {
        outcome: "confirm",
        itemId: "item-1",
        insecureHttpConfirmed: false,
      }),
      false,
    );
    assert.deepEqual(results, [{ outcome: "timeout" }]);

    const declined: HttpAuthConsentResult[] = [];
    await clock.tracker.open({
      challengeId: "early",
      origin: "https://files.example",
      resolve: (result) => declined.push(result),
    });
    assert.equal(await clock.tracker.finish("early", { outcome: "decline" }), true);
    clock.jump(97_000);
    await clock.tracker.restoreLostTimers();
    assert.deepEqual(declined, [{ outcome: "decline" }]);
    assert.equal(clock.logs.some((line) => line.includes("timeout")), false);
    assert.equal(session.early, undefined);
  });

  it("re-arms a timer that fires a few milliseconds before the deadline", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const clock = harness(session);
    const results: HttpAuthConsentResult[] = [];
    const deadline = await clock.tracker.open({
      challengeId: "c1",
      origin: "https://files.example",
      resolve: (result) => results.push(result),
    });
    await clock.tracker.attachWindow("c1", 11);
    clock.jump(90_000 - 5);
    await clock.fireLiveTimerEarly();
    assert.deepEqual(results, []);
    assert.equal(clock.closed.length, 0);
    assert.equal(clock.alarms.get("c1"), deadline);
    assert.equal(clock.liveTimers().length, 1);
    assert.equal(clock.liveTimers()[0]?.at, deadline);
    clock.jump(5);
    await clock.fireDue();
    assert.deepEqual(results, [{ outcome: "timeout" }]);
    assert.deepEqual(clock.closed, [11]);
    assert.equal(clock.liveTimers().length, 0);
    assert.equal(session.c1, undefined);
  });

  it("re-arms an alarm that fires a few milliseconds before the deadline", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const clock = harness(session);
    const results: HttpAuthConsentResult[] = [];
    const deadline = await clock.tracker.open({
      challengeId: "c1",
      origin: "https://files.example",
      resolve: (result) => results.push(result),
    });
    await clock.tracker.attachWindow("c1", 12);
    clock.jump(90_000 - 5);
    assert.equal(await clock.tracker.onAlarm("c1"), "pending");
    assert.deepEqual(results, []);
    assert.equal(clock.alarms.get("c1"), deadline);
    assert.equal(clock.liveTimers().length, 1);
    assert.equal(clock.liveTimers()[0]?.at, deadline);
    clock.jump(5);
    assert.equal(await clock.tracker.onAlarm("c1"), "expired");
    assert.deepEqual(results, [{ outcome: "timeout" }]);
    assert.deepEqual(clock.closed, [12]);
    assert.equal(clock.alarms.has("c1"), false);
  });

  it("expires from the background timer when the consent window timer never fires", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const clock = harness(session);
    const results: HttpAuthConsentResult[] = [];
    await clock.tracker.open({
      challengeId: "c1",
      origin: "https://files.example",
      resolve: (result) => results.push(result),
    });
    await clock.tracker.attachWindow("c1", 3);
    clock.jump(90_000);
    await clock.fireDue();
    assert.deepEqual(results, [{ outcome: "timeout" }]);
    assert.deepEqual(clock.closed, [3]);
    assert.equal(clock.liveTimers().length, 0);
  });

  it("accepts the consent window timeout message after the background realm is gone", async () => {
    const session: Record<string, HttpAuthPendingSession> = {};
    const first = harness(session);
    await first.tracker.open({
      challengeId: "c1",
      origin: "https://files.example",
      resolve: () => undefined,
    });
    await first.tracker.attachWindow("c1", 9);
    const restarted = harness(session);
    assert.equal(await restarted.tracker.forceTimeout("c1"), "expired");
    assert.equal(restarted.logs.some((line) => line.includes("[okkey] http-auth timeout")), true);
    assert.equal(restarted.logs.join("\n").includes(PASSWORD), false);
    assert.deepEqual(restarted.closed, [9]);
    assert.equal(await restarted.tracker.forceTimeout("c1"), "missing");
  });

  it("reads only this feature's alarm names", () => {
    assert.equal(challengeIdFromHttpAuthAlarm("okkey.httpAuth.timeout.c1"), "c1");
    assert.equal(challengeIdFromHttpAuthAlarm("okkey.deviceTrust.idleLock"), null);
  });
});
