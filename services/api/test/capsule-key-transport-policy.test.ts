import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPSULE_GUEST_KEY_TRANSPORT_CLAIM,
  DEFAULT_CAPSULE_KEY_TRANSPORT_MODE,
  hasUnsafeKeyTransportInUrl,
  listSafeCapsuleKeyTransportModes,
  normalizeCapsuleKeyTransportMode,
} from "../src/capsule/key-transport-policy.ts";

test("q2-5: capsule guest key claim is OOB fragment, not hybrid KEM", () => {
  assert.equal(CAPSULE_GUEST_KEY_TRANSPORT_CLAIM, "oob_fragment_not_kem");
  assert.deepEqual(listSafeCapsuleKeyTransportModes(), ["fragment", "out_of_band"]);
  assert.equal(DEFAULT_CAPSULE_KEY_TRANSPORT_MODE, "out_of_band");
});

test("normalizeCapsuleKeyTransportMode accepts fragment and out_of_band", () => {
  assert.equal(normalizeCapsuleKeyTransportMode("fragment"), "fragment");
  assert.equal(normalizeCapsuleKeyTransportMode("out_of_band"), "out_of_band");
  assert.equal(normalizeCapsuleKeyTransportMode(undefined), "out_of_band");
});

test("normalizeCapsuleKeyTransportMode rejects hybrid-KEM guest modes", () => {
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
      () => normalizeCapsuleKeyTransportMode(mode),
      /OOB fragment|not hybrid KEM/u,
      `expected reject for mode=${mode}`,
    );
  }
});

test("normalizeCapsuleKeyTransportMode rejects query/path/unsafe modes", () => {
  for (const mode of ["query", "path", "header", "body"]) {
    assert.throws(
      () => normalizeCapsuleKeyTransportMode(mode),
      /unsafe key transport/u,
      `expected reject for mode=${mode}`,
    );
  }
});

test("hasUnsafeKeyTransportInUrl detects capsule key query params", () => {
  assert.equal(hasUnsafeKeyTransportInUrl("/capsules/1/open?key=secret"), true);
  assert.equal(hasUnsafeKeyTransportInUrl("/capsules/1/open?capsule_key=x"), true);
  assert.equal(hasUnsafeKeyTransportInUrl("/capsules/1/open"), false);
  assert.equal(hasUnsafeKeyTransportInUrl(undefined), false);
});
