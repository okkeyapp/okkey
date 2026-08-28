import { describe, expect, it } from "vitest";

import {
  DOMAIN_CAPABILITIES_REFRESH_MS,
  isCacheValidForManifest,
  shouldRefreshDomainCapabilitiesCache,
} from "./domainCapabilitiesCache";

describe("domainCapabilitiesCache", () => {
  it("refreshes after 24 hours", () => {
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
});
