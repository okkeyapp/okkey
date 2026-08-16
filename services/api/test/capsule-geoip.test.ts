import assert from "node:assert/strict";
import test from "node:test";

import { clientIpFromTrustedProxy, MmdbGeoIpLookup } from "../src/capsule/geoip.ts";

test("trusted proxy parsing ignores forwarded headers unless explicitly configured", () => {
  assert.equal(clientIpFromTrustedProxy("10.0.0.2", "198.51.100.10, 10.0.0.1", 0), "10.0.0.2");
  assert.equal(clientIpFromTrustedProxy("10.0.0.2", "198.51.100.10, 10.0.0.1", 2), "198.51.100.10");
  assert.equal(clientIpFromTrustedProxy("::ffff:192.0.2.2", undefined, 0), "192.0.2.2");
});

test("disabled or missing MMDB returns Unknown without blocking", async () => {
  const disabled = new MmdbGeoIpLookup(false, "/missing/city.mmdb");
  assert.deepEqual(await disabled.lookup("8.8.8.8"), { country: null, city: null });

  const missing = new MmdbGeoIpLookup(true, "/missing/city.mmdb");
  assert.deepEqual(await missing.lookup("8.8.8.8"), { country: null, city: null });
});
