import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE,
  SPLIT_KEY_OPAQUE_SHARE_LEN,
  SPLIT_KEY_SHARE_B_TRANSPORT_CLAIM,
  assertOpaqueSplitKeyShare,
  listSafeSplitKeyShareTransportModes,
  normalizeSplitKeyShareTransportMode,
} from "../src/registration/split-key-transport-policy.ts";

test("q2-6: split-key share B claim is opaque local, not hybrid KEM", () => {
  assert.equal(SPLIT_KEY_SHARE_B_TRANSPORT_CLAIM, "opaque_local_not_hybrid_kem");
  assert.deepEqual(listSafeSplitKeyShareTransportModes(), ["opaque"]);
  assert.equal(DEFAULT_SPLIT_KEY_SHARE_TRANSPORT_MODE, "opaque");
  assert.equal(SPLIT_KEY_OPAQUE_SHARE_LEN, 32);
});

test("normalizeSplitKeyShareTransportMode accepts opaque", () => {
  assert.equal(normalizeSplitKeyShareTransportMode("opaque"), "opaque");
  assert.equal(normalizeSplitKeyShareTransportMode(undefined), "opaque");
});

test("normalizeSplitKeyShareTransportMode rejects hybrid-KEM share-B modes", () => {
  for (const mode of [
    "hybrid",
    "hybrid_ecc_pq_v1",
    "hybrid_recipient",
    "hybrid_kem",
    "mlkem",
    "ml_kem",
    "ML-KEM",
  ]) {
    assert.throws(
      () => normalizeSplitKeyShareTransportMode(mode),
      /opaque 32-byte|not hybrid KEM/u,
      `expected reject for mode=${mode}`,
    );
  }
});

test("normalizeSplitKeyShareTransportMode rejects unknown modes", () => {
  for (const mode of ["query", "fragment", "out_of_band", "wrapped"]) {
    assert.throws(
      () => normalizeSplitKeyShareTransportMode(mode),
      /unsupported split-key share transport/u,
      `expected reject for mode=${mode}`,
    );
  }
});

test("assertOpaqueSplitKeyShare accepts exactly 32 bytes", () => {
  assert.doesNotThrow(() =>
    assertOpaqueSplitKeyShare(new Uint8Array(32).fill(1), "device_share"),
  );
  assert.doesNotThrow(() =>
    assertOpaqueSplitKeyShare(new Uint8Array(32).fill(2), "server_key_share"),
  );
});

test("assertOpaqueSplitKeyShare rejects non-32 lengths (incl. hybrid-sized)", () => {
  for (const len of [0, 16, 31, 33, 1088, 1216]) {
    assert.throws(
      () => assertOpaqueSplitKeyShare(new Uint8Array(len), "device_share"),
      /must be 32 opaque bytes|not hybrid KEM/u,
      `expected reject for length=${len}`,
    );
  }
});
