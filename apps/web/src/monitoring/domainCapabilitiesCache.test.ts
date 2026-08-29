import { describe, expect, it } from "vitest";

import {
  DOMAIN_CAPABILITIES_REFRESH_MS,
  DOMAIN_CAPABILITIES_RETRY_AFTER_FAIL_MS,
  isCacheValidForManifest,
  shouldRefreshDomainCapabilitiesCache,
} from "./domainCapabilitiesCache";

describe("domainCapabilitiesCache", () => {
  it("treats catalog as fresh for 24 hours after a successful fetch", () => {
    const now = Date.UTC(2026, 0, 2);
    const fetchedAt = now - DOMAIN_CAPABILITIES_REFRESH_MS - 1;
    expect(shouldRefreshDomainCapabilitiesCache(fetchedAt, now)).toBe(true);
    expect(shouldRefreshDomainCapabilitiesCache(now - 1000, now)).toBe(false);
  });

  it("invalidates cache when manifest version changes", () => {
    const now = Date.now();
    const cache = {
      version: "2026.01.01",
      sha256: "abc",
      fetchedAt: now,
      entries: {},
    };
    expect(isCacheValidForManifest(cache, "2026.01.01", now)).toBe(true);
    expect(isCacheValidForManifest(cache, "2026.01.02", now)).toBe(false);
  });

  it("uses 1 hour cooldown after a failed GitHub fetch", () => {
    expect(DOMAIN_CAPABILITIES_RETRY_AFTER_FAIL_MS).toBe(60 * 60 * 1000);
  });
});
