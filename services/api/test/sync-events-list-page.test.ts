import test from "node:test";
import assert from "node:assert/strict";
import {
  areContiguousEventVersions,
  eventsListHasMore,
  latestVersionFromEventsPage,
} from "../../../packages/sync/dist/index.js";

test("eventsListHasMore is false for empty pages", () => {
  assert.equal(eventsListHasMore({ events: [] }), false);
  assert.equal(eventsListHasMore({ events: [], hasMore: true }), false);
});

test("eventsListHasMore respects explicit hasMore", () => {
  assert.equal(eventsListHasMore({ events: [{}], hasMore: true }), true);
  assert.equal(eventsListHasMore({ events: [{}], hasMore: false }), false);
});

test("eventsListHasMore treats legacy bodies without hasMore as complete", () => {
  assert.equal(eventsListHasMore({ events: [{}] }), false);
});

test("areContiguousEventVersions requires exact tip+1 sequence", () => {
  assert.equal(areContiguousEventVersions([], 3), false);
  assert.equal(areContiguousEventVersions([{ version: 4 }], 3), true);
  assert.equal(
    areContiguousEventVersions([{ version: 4 }, { version: 5 }, { version: 6 }], 3),
    true,
  );
  assert.equal(areContiguousEventVersions([{ version: 5 }], 3), false);
  assert.equal(areContiguousEventVersions([{ version: 4 }, { version: 6 }], 3), false);
});

test("latestVersionFromEventsPage prefers server field", () => {
  assert.equal(latestVersionFromEventsPage(2, [{ version: 3 }], 9), 9);
  assert.equal(latestVersionFromEventsPage(2, [{ version: 3 }, { version: 4 }]), 4);
  assert.equal(latestVersionFromEventsPage(7, []), 7);
});
