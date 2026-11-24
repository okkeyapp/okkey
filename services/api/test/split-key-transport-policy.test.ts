import assert from "node:assert/strict";
import test from "node:test";
import { encodeSplitKeyShareBFrame } from "@okkey/crypto";
import {
  DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE,
  SPLIT_KEY_OPAQUE_SHARE_LEN,
  SPLIT_KEY_SHARE_B_TRANSPORT_CLAIM,
  assertOpaqueSplitKeyShare,
  assertSplitKeyShareB,
  listSafeSplitKeyShareTransportModes,
  normalizeSplitKeyShareTransportMode,
} from "../src/registration/split-key-transport-policy.ts";

function hybridFrame(): Uint8Array {
  const envelope = new Uint8Array(1148 + 48);
  envelope[0] = 1;
  envelope[1] = 1;
  envelope[2] = 1;
  envelope[3] = 0;
  return encodeSplitKeyShareBFrame({
    ed25519PublicKey: new Uint8Array(32).fill(3),
    mlkemEncapsulationKey: new Uint8Array(1184).fill(4),
    envelope,
  });
}

test("share B claim is the hybrid X25519+ML-KEM envelope", () => {
  assert.equal(SPLIT_KEY_SHARE_B_TRANSPORT_CLAIM, "hybrid_ecc_pq_v1");
  assert.deepEqual(listSafeSplitKeyShareTransportModes(), ["hybrid_ecc_pq_v1"]);
  assert.equal(DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE, "hybrid_ecc_pq_v1");
  assert.equal(SPLIT_KEY_OPAQUE_SHARE_LEN, 32);
});

test("normalizeSplitKeyShareTransportMode accepts only the hybrid envelope", () => {
  assert.equal(normalizeSplitKeyShareTransportMode("hybrid_ecc_pq_v1"), "hybrid_ecc_pq_v1");
  assert.equal(normalizeSplitKeyShareTransportMode(undefined), "hybrid_ecc_pq_v1");
  assert.throws(
    () => normalizeSplitKeyShareTransportMode("opaque"),
    /unsupported split-key share transport/u,
  );
});

test("normalizeSplitKeyShareTransportMode rejects unknown modes", () => {
  for (const mode of ["query", "fragment", "out_of_band", "wrapped", "mlkem", "hybrid", "opaque"]) {
    assert.throws(
      () => normalizeSplitKeyShareTransportMode(mode),
      /unsupported split-key share transport/u,
      `expected reject for mode=${mode}`,
    );
  }
});

test("assertOpaqueSplitKeyShare accepts exactly 32 bytes for share A", () => {
  assert.doesNotThrow(() =>
    assertOpaqueSplitKeyShare(new Uint8Array(32).fill(2), "server_key_share"),
  );
});

test("assertOpaqueSplitKeyShare rejects non-32 lengths", () => {
  for (const len of [0, 16, 31, 33, 1088]) {
    assert.throws(
      () => assertOpaqueSplitKeyShare(new Uint8Array(len), "server_key_share"),
      /must be 32 opaque bytes/u,
      `expected reject for length=${len}`,
    );
  }
});

test("assertSplitKeyShareB accepts a hybrid frame and rejects a raw 32-byte share", () => {
  assert.doesNotThrow(() => assertSplitKeyShareB(hybridFrame()));
  assert.throws(
    () => assertSplitKeyShareB(new Uint8Array(32).fill(1)),
    /hybrid X25519\+ML-KEM share envelope/u,
  );
});

test("assertSplitKeyShareB rejects malformed lengths", () => {
  for (const len of [0, 16, 31, 33, 1088, 1216]) {
    assert.throws(
      () => assertSplitKeyShareB(new Uint8Array(len)),
      /hybrid X25519\+ML-KEM share envelope/u,
      `expected reject for length=${len}`,
    );
  }
});
