import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  diffAvailableUpdates,
  isFeedVersionNewer,
  parseUpdateFeedDocument,
} from "../src/updates/feed-contract.ts";
import { loadUpdateFeedDocument } from "../src/updates/load-update-feed.ts";

test("parseUpdateFeedDocument accepts schema v1", () => {
  const doc = parseUpdateFeedDocument({
    schemaVersion: 1,
    generatedAt: "2026-10-23T00:00:00.000Z",
    components: [
      { id: "okkey", version: "1.0.1", notes: "fixes" },
      { id: "okkey-enterprise", version: "1.0.1" },
    ],
  });
  assert.equal(doc.components.length, 2);
  assert.equal(doc.components[0]?.id, "okkey");
});

test("parseUpdateFeedDocument rejects bad schema", () => {
  assert.throws(() => parseUpdateFeedDocument({ schemaVersion: 2, components: [] }), /schemaVersion/);
});

test("isFeedVersionNewer compares dotted versions", () => {
  assert.equal(isFeedVersionNewer("1.0.0", "1.0.1"), true);
  assert.equal(isFeedVersionNewer("1.0.1", "1.0.0"), false);
  assert.equal(isFeedVersionNewer("1.0.0", "1.0.0"), false);
  assert.equal(isFeedVersionNewer("dev", "staging-2"), true);
});

test("diffAvailableUpdates returns from→to for okkey + enterprise", () => {
  const result = diffAvailableUpdates({
    deploymentMode: "self_hosted",
    feedConfigured: true,
    currentOkkey: "1.0.0",
    currentEnterprise: "1.0.0-beta.1",
    feed: {
      schemaVersion: 1,
      components: [
        { id: "okkey", version: "1.0.1", notes: "core bump" },
        { id: "okkey-enterprise", version: "1.0.0-beta.2", notes: "ee bump" },
      ],
    },
  });
  assert.equal(result.available.length, 2);
  assert.deepEqual(result.available[0], {
    id: "okkey",
    from: "1.0.0",
    to: "1.0.1",
    notes: "core bump",
    packageUrl: null,
    digest: null,
  });
  assert.equal(result.available[1]?.id, "okkey-enterprise");
  assert.equal(result.available[1]?.from, "1.0.0-beta.1");
  assert.equal(result.available[1]?.to, "1.0.0-beta.2");
});

test("diffAvailableUpdates skips enterprise when modules off", () => {
  const result = diffAvailableUpdates({
    deploymentMode: "self_hosted",
    feedConfigured: true,
    currentOkkey: "1.0.0",
    currentEnterprise: null,
    feed: {
      schemaVersion: 1,
      components: [
        { id: "okkey", version: "1.0.1" },
        { id: "okkey-enterprise", version: "9.9.9" },
      ],
    },
  });
  assert.equal(result.available.length, 1);
  assert.equal(result.available[0]?.id, "okkey");
});

test("diffAvailableUpdates is empty on saas even with feed", () => {
  const result = diffAvailableUpdates({
    deploymentMode: "saas",
    feedConfigured: true,
    currentOkkey: "1.0.0",
    currentEnterprise: null,
    feed: {
      schemaVersion: 1,
      components: [{ id: "okkey", version: "2.0.0" }],
    },
  });
  assert.deepEqual(result.available, []);
});

test("loadUpdateFeedDocument reads path without network", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-feed-"));
  const feedPath = path.join(dir, "feed.json");
  writeFileSync(
    feedPath,
    JSON.stringify({
      schemaVersion: 1,
      components: [{ id: "okkey", version: "2.0.0", notes: "mock" }],
    }),
    "utf8",
  );
  const doc = await loadUpdateFeedDocument({
    url: "https://license.okkey.io/should-not-call",
    path: feedPath,
    timeoutMs: 1000,
  });
  assert.equal(doc.components[0]?.version, "2.0.0");
});
