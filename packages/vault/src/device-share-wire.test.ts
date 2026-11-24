import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encodeSplitKeyShareBFrame } from "@okkey/crypto";

import { deviceShareRewriteB64, mergeDeviceShareFromServer } from "../dist/device-share-wire.js";

function hybridShareB64(): string {
  const envelope = new Uint8Array(1148 + 48);
  envelope[0] = 1;
  envelope[1] = 1;
  envelope[2] = 1;
  envelope[3] = 0;
  const framed = encodeSplitKeyShareBFrame({
    ed25519PublicKey: new Uint8Array(32).fill(3),
    mlkemEncapsulationKey: new Uint8Array(1184).fill(4),
    envelope,
  });
  return Buffer.from(framed).toString("base64");
}

describe("mergeDeviceShareFromServer", () => {
  it("keeps a local legacy share and asks for an upload when the server share is empty", () => {
    const local = Buffer.alloc(32, 7).toString("base64");
    const merged = mergeDeviceShareFromServer({
      localShareB64: local,
      serverShareB64: "",
    });
    assert.deepEqual(merged, { deviceShareB64: local, rewrite: true });
  });

  it("keeps a server envelope and does not upload again", () => {
    const server = hybridShareB64();
    const merged = mergeDeviceShareFromServer({
      localShareB64: Buffer.alloc(32, 7).toString("base64"),
      serverShareB64: server,
    });
    assert.deepEqual(merged, { deviceShareB64: server, rewrite: false });
  });

  it("does not invent a share when both sides are empty", () => {
    assert.equal(
      mergeDeviceShareFromServer({ localShareB64: null, serverShareB64: null }),
      null,
    );
  });
});

describe("deviceShareRewriteB64", () => {
  it("does not mint a share when the local value is missing or not a share", async () => {
    assert.equal(await deviceShareRewriteB64({ userId: "user-1", localShareB64: "" }), null);
    assert.equal(await deviceShareRewriteB64({ userId: "user-1", localShareB64: "YQ==" }), null);
  });
});
