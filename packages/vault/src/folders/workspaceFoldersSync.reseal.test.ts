import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePersonalEventsVersionMismatch } from "./personalEventsVersionMismatch.ts";
import { shouldResealLocalFoldersForStreamKey } from "./shouldResealLocalFoldersForStreamKey.ts";

describe("parsePersonalEventsVersionMismatch", () => {
  it("parses ApiRequestError-shaped VERSION_MISMATCH body", () => {
    const err = {
      name: "ApiRequestError",
      status: 409,
      body: {
        error: "VERSION_MISMATCH",
        message: "baseVersion is stale",
        requestId: "req_test",
        details: {
          expectedBaseVersion: 3,
          latestVersion: 10,
        },
      },
    };
    assert.deepEqual(parsePersonalEventsVersionMismatch(err), {
      expectedBaseVersion: 3,
      latestVersion: 10,
    });
  });

  it("parses bare body-shaped objects", () => {
    assert.deepEqual(
      parsePersonalEventsVersionMismatch({
        error: "VERSION_MISMATCH",
        message: "stale",
        details: { expectedBaseVersion: 1, latestVersion: 2 },
      }),
      { expectedBaseVersion: 1, latestVersion: 2 },
    );
  });

  it("returns null for unrelated errors", () => {
    assert.equal(parsePersonalEventsVersionMismatch(new Error("boom")), null);
    assert.equal(
      parsePersonalEventsVersionMismatch({
        body: {
          error: "SYNC_BAD_REQUEST",
          message: "nope",
          requestId: "req_test",
        },
      }),
      null,
    );
  });
});

describe("shouldResealLocalFoldersForStreamKey", () => {
  it("reseals when stream is mixed-key and local folders are missing on decryptable set", () => {
    // Real folders in IndexedDB + only extension-repair-probe decrypts on stream.
    // Caller must already have applied decryptable remote DELETE/CREATE.
    assert.equal(
      shouldResealLocalFoldersForStreamKey({
        localFolderCount: 2,
        decrypts: true,
        tipVersion: 3,
        folderDecryptFail: 2,
        localMissingOnStream: true,
      }),
      true,
    );
  });

  it("does not reseal when local real folders are already covered by decryptable stream", () => {
    assert.equal(
      shouldResealLocalFoldersForStreamKey({
        localFolderCount: 1,
        decrypts: true,
        tipVersion: 3,
        folderDecryptFail: 2,
        localMissingOnStream: false,
      }),
      false,
    );
  });

  it("does not reseal when callers excluded probe-only cache (localFolderCount 0)", () => {
    // Extension/web cold start with only extension-repair-probe — resealing
    // cannot invent real folders; stream must already carry them under current C.
    assert.equal(
      shouldResealLocalFoldersForStreamKey({
        localFolderCount: 0,
        decrypts: true,
        tipVersion: 3,
        folderDecryptFail: 2,
        localMissingOnStream: false,
      }),
      false,
    );
  });

  it("reseals when nothing decrypts but tip and local cache exist", () => {
    assert.equal(
      shouldResealLocalFoldersForStreamKey({
        localFolderCount: 6,
        decrypts: false,
        tipVersion: 325,
        folderDecryptFail: 56,
        localMissingOnStream: true,
      }),
      true,
    );
  });

  it("does not reseal a healthy stream", () => {
    assert.equal(
      shouldResealLocalFoldersForStreamKey({
        localFolderCount: 2,
        decrypts: true,
        tipVersion: 10,
        folderDecryptFail: 0,
        localMissingOnStream: false,
      }),
      false,
    );
  });

  it("does not reseal after catch-up when deleted folders left the local set", () => {
    // Stale cache had folder A; decryptable DELETE removed it during replay.
    // localMissingOnStream must be evaluated on the post-replay set only.
    assert.equal(
      shouldResealLocalFoldersForStreamKey({
        localFolderCount: 1,
        decrypts: true,
        tipVersion: 12,
        folderDecryptFail: 3,
        localMissingOnStream: false,
      }),
      false,
    );
  });
});
