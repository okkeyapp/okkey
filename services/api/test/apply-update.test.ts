import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createTestApiConfig } from "./test-api-config.ts";
import { applySystemUpdates } from "../src/updates/apply-update.ts";

test("applySystemUpdates returns 501 when mode is off", async () => {
  const result = await applySystemUpdates(createTestApiConfig());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "UPDATE_APPLY_UNAVAILABLE");
    assert.equal(result.status, 501);
  }
});

test("applySystemUpdates version_file advances OKKEY_VERSION_FILE", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-apply-vf-"));
  const feedPath = path.join(dir, "feed.json");
  const versionFilePath = path.join(dir, "version.json");
  writeFileSync(
    feedPath,
    JSON.stringify({
      schemaVersion: 1,
      components: [{ id: "okkey", version: "1.0.0-betta.4", notes: "bump" }],
    }),
    "utf8",
  );
  writeFileSync(
    versionFilePath,
    JSON.stringify({ okkey: "1.0.0-betta.3", enterprise: null }),
    "utf8",
  );

  const previous = process.env.OKKEY_VERSION;
  delete process.env.OKKEY_VERSION;
  try {
    const result = await applySystemUpdates(
      createTestApiConfig({
        updateFeedPath: feedPath,
        updateApplyMode: "version_file",
        updateVersionFilePath: versionFilePath,
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.applied, true);
      assert.equal(result.current.okkey, "1.0.0-betta.4");
      assert.equal(result.mode, "version_file");
    }
    const written = JSON.parse(readFileSync(versionFilePath, "utf8")) as { okkey: string };
    assert.equal(written.okkey, "1.0.0-betta.4");
  } finally {
    if (previous === undefined) {
      delete process.env.OKKEY_VERSION;
    } else {
      process.env.OKKEY_VERSION = previous;
    }
  }
});
