import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  clearSplitKeyShareWrapKey,
  loadSplitKeyShareWrapKey,
  persistSplitKeyShareWrapKey,
} from "../dist/split-key-share-wrap-store.js";

function fakeKey(fill: number) {
  return {
    ed25519Seed: new Uint8Array(32).fill(fill),
    ed25519PublicKey: new Uint8Array(32).fill(fill + 1),
    mlkemDecapsulationKey: new Uint8Array(64).fill(fill + 2),
    mlkemEncapsulationKey: new Uint8Array(64).fill(fill + 3),
  };
}

describe("loadSplitKeyShareWrapKey pending promotion", () => {
  afterEach(async () => {
    await clearSplitKeyShareWrapKey("pending");
    await clearSplitKeyShareWrapKey("user-1");
  });

  it("promotes a pending wrap key onto the user id and clears pending", async (t) => {
    if (typeof indexedDB === "undefined") {
      t.skip("indexedDB unavailable in this runner");
      return;
    }
    const pending = fakeKey(7);
    await persistSplitKeyShareWrapKey("pending", pending);

    const loaded = await loadSplitKeyShareWrapKey("user-1");
    assert.equal(loaded?.ed25519Seed[0], 7);

    const own = await loadSplitKeyShareWrapKey("user-1");
    assert.equal(own?.ed25519Seed[0], 7);

    const stillPending = await loadSplitKeyShareWrapKey("pending");
    assert.equal(stillPending, null);
  });

  it("prefers an existing user-scoped key over pending", async (t) => {
    if (typeof indexedDB === "undefined") {
      t.skip("indexedDB unavailable in this runner");
      return;
    }
    await persistSplitKeyShareWrapKey("pending", fakeKey(1));
    await persistSplitKeyShareWrapKey("user-1", fakeKey(9));

    const loaded = await loadSplitKeyShareWrapKey("user-1");
    assert.equal(loaded?.ed25519Seed[0], 9);
  });
});
