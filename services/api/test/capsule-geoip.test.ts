import assert from "node:assert/strict";
import test from "node:test";

import {
  clientIpFromTrustedProxy,
  isLoopbackIp,
  isPublicLookupIp,
  MmdbGeoIpLookup,
  resetEgressPublicIpCache,
} from "../src/capsule/geoip.ts";

test("trusted proxy parsing ignores forwarded headers unless explicitly configured", () => {
  assert.equal(clientIpFromTrustedProxy("10.0.0.2", "198.51.100.10, 10.0.0.1", 0), "10.0.0.2");
  assert.equal(clientIpFromTrustedProxy("10.0.0.2", "198.51.100.10, 10.0.0.1", 2), "198.51.100.10");
  assert.equal(clientIpFromTrustedProxy("::ffff:192.0.2.2", undefined, 0), "192.0.2.2");
});

test("loopback remote honors X-Forwarded-For without trusted hops", () => {
  assert.equal(clientIpFromTrustedProxy("::1", "198.51.100.10", 0), "198.51.100.10");
  assert.equal(clientIpFromTrustedProxy("127.0.0.1", "203.0.113.5, 10.0.0.1", 0), "203.0.113.5");
  assert.equal(clientIpFromTrustedProxy("::1", undefined, 0), "::1");
});

test("public lookup IP excludes loopback and private ranges", () => {
  assert.equal(isPublicLookupIp("8.8.8.8"), true);
  assert.equal(isPublicLookupIp("::1"), false);
  assert.equal(isPublicLookupIp("127.0.0.1"), false);
  assert.equal(isPublicLookupIp("192.168.1.1"), false);
  assert.equal(isLoopbackIp("::1"), true);
});

test("disabled or missing MMDB returns Unknown without blocking", async () => {
  resetEgressPublicIpCache();
  const disabled = new MmdbGeoIpLookup(false, "/missing/city.mmdb");
  assert.deepEqual(await disabled.lookup("8.8.8.8"), { country: null, city: null });

  const missing = new MmdbGeoIpLookup(true, "/missing/city.mmdb");
  assert.deepEqual(await missing.lookup("8.8.8.8"), { country: null, city: null });
});
