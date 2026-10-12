import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  bytesEqual,
  expandFaviconLookupKeys,
  hostsFromUrls,
  registrableDomainFromHost,
} from "../src/favicon/fetch-remote.ts";

describe("hostsFromUrls", () => {
  test("returns hosts in URL list order", () => {
    assert.deepEqual(
      hostsFromUrls(["https://gog.ru", "https://google.com"]),
      ["gog.ru", "google.com"],
    );
  });

  test("skips unsuitable hosts but keeps order", () => {
    assert.deepEqual(
      hostsFromUrls(["http://localhost:3000", "https://google.com", "192.168.0.1"]),
      ["google.com"],
    );
  });
});

describe("expandFaviconLookupKeys", () => {
  test("full URL, then origin, then https eTLD+1", () => {
    assert.deepEqual(
      expandFaviconLookupKeys(["https://d3v-alexanderzorin.zendesk.com/access/normal"]),
      [
        "https://d3v-alexanderzorin.zendesk.com/access/normal",
        "https://d3v-alexanderzorin.zendesk.com",
        "https://zendesk.com",
      ],
    );
  });

  test("does not duplicate origin when it is the full URL", () => {
    assert.deepEqual(expandFaviconLookupKeys(["https://zendesk.com"]), ["https://zendesk.com"]);
  });
});

describe("registrableDomainFromHost", () => {
  test("strips subdomain to eTLD+1", () => {
    assert.equal(registrableDomainFromHost("d3v-alexanderzorin.zendesk.com"), "zendesk.com");
  });

  test("keeps multi-part public suffixes", () => {
    assert.equal(registrableDomainFromHost("www.bbc.co.uk"), "bbc.co.uk");
  });
});

describe("bytesEqual", () => {
  test("compares byte arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    assert.equal(bytesEqual(a, a), true);
    assert.equal(bytesEqual(a, new Uint8Array([1, 2, 3])), true);
    assert.equal(bytesEqual(a, new Uint8Array([1, 2])), false);
  });
});
