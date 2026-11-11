import assert from "node:assert/strict";
import { test } from "node:test";

import { describe, it } from "vitest";
import {
  parseVaultAccessVersionMismatch,
  readLatestVaultAccessVersion,
  runWithVaultAccessVersionRetry,
} from "./vaultAccessVersion";

it("readLatestVaultAccessVersion defaults to 0", () => {
  assert.equal(readLatestVaultAccessVersion({}), 0);
  assert.equal(readLatestVaultAccessVersion({ latestVersion: 7 }), 7);
});

it("parseVaultAccessVersionMismatch reads ApiRequestError body", () => {
  const error = {
    name: "ApiRequestError",
    status: 409,
    body: {
      error: "VERSION_MISMATCH",
      message: "baseVersion is stale",
      details: { expectedBaseVersion: 0, latestVersion: 3 },
    },
  };
  assert.deepEqual(parseVaultAccessVersionMismatch(error), { latestVersion: 3 });
  assert.equal(parseVaultAccessVersionMismatch(new Error("nope")), null);
});

it("runWithVaultAccessVersionRetry retries once on VERSION_MISMATCH", async () => {
  const versions: number[] = [];
  await runWithVaultAccessVersionRetry(0, async (baseVersion) => {
    versions.push(baseVersion);
    if (baseVersion === 0) {
      const error = {
        name: "ApiRequestError",
        body: {
          error: "VERSION_MISMATCH",
          details: { expectedBaseVersion: 0, latestVersion: 4 },
        },
      };
      throw error;
    }
  });
  assert.deepEqual(versions, [0, 4]);
});
