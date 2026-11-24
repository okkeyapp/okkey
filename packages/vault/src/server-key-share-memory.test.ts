import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  acquireServerKeyShare,
  clearRememberedServerKeyShares,
  readRememberedServerKeyShare,
  rememberServerKeyShare,
} from "./server-key-share-memory.ts";

afterEach(() => {
  clearRememberedServerKeyShares();
});

describe("acquireServerKeyShare", () => {
  it("returns the in-memory share without calling the server", async () => {
    rememberServerKeyShare("user-1", "from-memory");
    let fetched = 0;
    const acquired = await acquireServerKeyShare({
      userId: "user-1",
      legacyShareB64: "legacy",
      fetchFromServer: async () => {
        fetched += 1;
        return "from-server";
      },
    });
    assert.deepEqual(acquired, { shareB64: "from-memory", source: "memory" });
    assert.equal(fetched, 0);
  });

  it("fetches after authentication and remembers the share for this realm", async () => {
    const acquired = await acquireServerKeyShare({
      userId: "user-1",
      legacyShareB64: "legacy",
      fetchFromServer: async () => "from-server",
    });
    assert.deepEqual(acquired, { shareB64: "from-server", source: "server" });
    assert.equal(readRememberedServerKeyShare("user-1"), "from-server");
  });

  it("falls back to the legacy copy when the fetch fails and does not remember it", async () => {
    const acquired = await acquireServerKeyShare({
      userId: "user-1",
      legacyShareB64: "legacy",
      fetchFromServer: async () => {
        throw new Error("offline");
      },
    });
    assert.deepEqual(acquired, { shareB64: "legacy", source: "legacy" });
    assert.equal(readRememberedServerKeyShare("user-1"), null);
  });

  it("returns null when there is no memory, server, or legacy share", async () => {
    const acquired = await acquireServerKeyShare({
      userId: "user-1",
      fetchFromServer: async () => null,
    });
    assert.equal(acquired, null);
  });

  it("drops a stale fetch when a newer share was committed while it was in flight", async () => {
    let releaseFetch: (share: string) => void = () => {};
    const pending = acquireServerKeyShare({
      userId: "user-1",
      fetchFromServer: () =>
        new Promise((resolveShare) => {
          releaseFetch = resolveShare;
        }),
    });
    rememberServerKeyShare("user-1", "rotated");
    releaseFetch("stale-from-server");
    const acquired = await pending;
    assert.deepEqual(acquired, { shareB64: "rotated", source: "memory" });
    assert.equal(readRememberedServerKeyShare("user-1"), "rotated");
  });

  it("clears every remembered share", () => {
    rememberServerKeyShare("user-1", "a");
    rememberServerKeyShare("user-2", "b");
    clearRememberedServerKeyShares();
    assert.equal(readRememberedServerKeyShare("user-1"), null);
    assert.equal(readRememberedServerKeyShare("user-2"), null);
  });
});
