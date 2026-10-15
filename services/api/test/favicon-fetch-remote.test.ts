import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  bytesEqual,
  hostsFromUrls,
  isAllowedFaviconFetchUrl,
  isDisallowedResolvedAddress,
  isHostSuitableForFaviconLookup,
  looksLikeImageBytes,
  MAX_FAVICON_RESPONSE_BYTES,
  parseFaviconProvider,
  fetchRemoteFaviconBytes,
  fetchRemoteFaviconBytesFromUrls,
  setFaviconHostResolverForTests,
  setFaviconOutboundRequestForTests,
  type FaviconOutboundRequest,
} from "../src/favicon/fetch-remote.ts";

afterEach(() => {
  setFaviconHostResolverForTests(null);
  setFaviconOutboundRequestForTests(null);
});

function mockOutbound(
  handler: (url: URL, pinnedAddress: string) => {
    status: number;
    headers?: Record<string, string>;
    body?: Uint8Array | null;
  },
): { requested: Array<{ href: string; pinnedAddress: string }> } {
  const requested: Array<{ href: string; pinnedAddress: string }> = [];
  const request: FaviconOutboundRequest = async (url, options) => {
    requested.push({ href: url.href, pinnedAddress: options.pinned.address });
    const result = handler(url, options.pinned.address);
    const body = result.body ?? null;
    return {
      status: result.status,
      headers: result.headers ?? {},
      readBody: async (maxBytes) => {
        if (!body) {
          return new Uint8Array();
        }
        if (body.byteLength > maxBytes) {
          return null;
        }
        return body;
      },
    };
  };
  setFaviconOutboundRequestForTests(request);
  return { requested };
}

function pngBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  return bytes;
}

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

  test("skips localhost-like and IPv6 literal hosts", () => {
    assert.deepEqual(
      hostsFromUrls([
        "https://localhost.localdomain",
        "https://app.localhost",
        "http://[::1]/",
        "https://example.com",
      ]),
      ["example.com"],
    );
  });
});

describe("isHostSuitableForFaviconLookup", () => {
  test("rejects literals and local names", () => {
    assert.equal(isHostSuitableForFaviconLookup("127.0.0.1"), false);
    assert.equal(isHostSuitableForFaviconLookup("10.0.0.1"), false);
    assert.equal(isHostSuitableForFaviconLookup("::1"), false);
    assert.equal(isHostSuitableForFaviconLookup("[::1]"), false);
    assert.equal(isHostSuitableForFaviconLookup("localhost"), false);
    assert.equal(isHostSuitableForFaviconLookup("localhost.localdomain"), false);
    assert.equal(isHostSuitableForFaviconLookup("foo.localhost"), false);
    assert.equal(isHostSuitableForFaviconLookup("printer.local"), false);
  });

  test("accepts public-looking hostnames", () => {
    assert.equal(isHostSuitableForFaviconLookup("example.com"), true);
    assert.equal(isHostSuitableForFaviconLookup("sub.example.co.uk"), true);
  });
});

describe("isDisallowedResolvedAddress", () => {
  test("rejects loopback, private, link-local, and ULA", () => {
    assert.equal(isDisallowedResolvedAddress("127.0.0.1"), true);
    assert.equal(isDisallowedResolvedAddress("10.0.0.1"), true);
    assert.equal(isDisallowedResolvedAddress("192.168.1.1"), true);
    assert.equal(isDisallowedResolvedAddress("172.16.0.1"), true);
    assert.equal(isDisallowedResolvedAddress("169.254.169.254"), true);
    assert.equal(isDisallowedResolvedAddress("100.64.0.1"), true);
    assert.equal(isDisallowedResolvedAddress("::1"), true);
    assert.equal(isDisallowedResolvedAddress("fe80::1"), true);
    assert.equal(isDisallowedResolvedAddress("fd12:3456:789a::1"), true);
    assert.equal(isDisallowedResolvedAddress("fc00::1"), true);
  });

  test("rejects benchmarking, multicast, reserved, NAT64, and 6to4 ranges", () => {
    assert.equal(isDisallowedResolvedAddress("198.18.0.1"), true);
    assert.equal(isDisallowedResolvedAddress("198.19.255.255"), true);
    assert.equal(isDisallowedResolvedAddress("224.0.0.1"), true);
    assert.equal(isDisallowedResolvedAddress("239.1.2.3"), true);
    assert.equal(isDisallowedResolvedAddress("240.0.0.1"), true);
    assert.equal(isDisallowedResolvedAddress("255.255.255.255"), true);
    assert.equal(isDisallowedResolvedAddress("64:ff9b::c000:201"), true);
    assert.equal(isDisallowedResolvedAddress("2002:cb00:7100::1"), true);
    assert.equal(isDisallowedResolvedAddress("::ffff:198.18.0.1"), true);
  });

  test("allows public addresses", () => {
    assert.equal(isDisallowedResolvedAddress("93.184.216.34"), false);
    assert.equal(isDisallowedResolvedAddress("8.8.8.8"), false);
    assert.equal(isDisallowedResolvedAddress("198.20.0.1"), false);
    assert.equal(isDisallowedResolvedAddress("2001:4860:4860::8888"), false);
  });
});

describe("isAllowedFaviconFetchUrl", () => {
  test("allows default http/https ports only", () => {
    assert.equal(isAllowedFaviconFetchUrl(new URL("https://example.com/favicon.ico")), true);
    assert.equal(isAllowedFaviconFetchUrl(new URL("http://example.com/favicon.ico")), true);
    assert.equal(isAllowedFaviconFetchUrl(new URL("https://example.com:443/favicon.ico")), true);
    assert.equal(isAllowedFaviconFetchUrl(new URL("http://example.com:80/favicon.ico")), true);
    assert.equal(isAllowedFaviconFetchUrl(new URL("https://example.com:8443/favicon.ico")), false);
    assert.equal(isAllowedFaviconFetchUrl(new URL("http://example.com:8080/favicon.ico")), false);
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

describe("parseFaviconProvider", () => {
  test("defaults to direct", () => {
    assert.equal(parseFaviconProvider(undefined), "direct");
    assert.equal(parseFaviconProvider(""), "direct");
    assert.equal(parseFaviconProvider("DIRECT"), "direct");
  });

  test("accepts google and off", () => {
    assert.equal(parseFaviconProvider("google"), "google");
    assert.equal(parseFaviconProvider("off"), "off");
  });

  test("rejects unknown values", () => {
    assert.throws(() => parseFaviconProvider("yandex"), /FAVICON_PROVIDER/);
  });
});

describe("looksLikeImageBytes", () => {
  test("detects PNG magic", () => {
    const png = new Uint8Array(32);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    assert.equal(looksLikeImageBytes(png), true);
  });

  test("rejects HTML and tiny payloads", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html></html>");
    assert.equal(looksLikeImageBytes(html), false);
    assert.equal(looksLikeImageBytes(new Uint8Array([0x89, 0x50])), false);
  });
});

describe("fetchRemoteFaviconBytes provider=off", () => {
  test("returns null without network", async () => {
    assert.equal(await fetchRemoteFaviconBytes("example.com", { provider: "off" }), null);
    assert.equal(
      await fetchRemoteFaviconBytesFromUrls(["https://example.com"], { provider: "off" }),
      null,
    );
  });
});

describe("fetchRemoteFaviconBytes provider=direct", () => {
  test("direct provider requests the site origin with pinned address", async () => {
    setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
    const { requested } = mockOutbound(() => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: new TextEncoder().encode("not-an-image"),
    }));

    await fetchRemoteFaviconBytes("example.com", { provider: "direct" });

    assert.ok(requested.length > 0);
    for (const entry of requested) {
      assert.match(entry.href, /^https:\/\/example\.com\//);
      assert.doesNotMatch(entry.href, /google\.com/i);
      assert.equal(entry.pinnedAddress, "93.184.216.34");
    }
  });

  test("skips hosts that resolve to disallowed addresses", async () => {
    setFaviconHostResolverForTests(async () => ["127.0.0.1"]);
    const { requested } = mockOutbound(() => ({ status: 404 }));

    const bytes = await fetchRemoteFaviconBytes("127.0.0.1.nip.io", { provider: "direct" });
    assert.equal(bytes, null);
    assert.deepEqual(requested, []);
  });

  test("skips hosts that resolve to benchmarking range addresses", async () => {
    setFaviconHostResolverForTests(async () => ["198.18.0.1"]);
    const { requested } = mockOutbound(() => ({ status: 200, body: pngBytes() }));

    const bytes = await fetchRemoteFaviconBytes("lab.example.com", { provider: "direct" });
    assert.equal(bytes, null);
    assert.deepEqual(requested, []);
  });

  test("does not follow redirects to disallowed hosts", async () => {
    setFaviconHostResolverForTests(async (hostname) => {
      if (hostname === "example.com") {
        return ["93.184.216.34"];
      }
      if (hostname === "127.0.0.1.nip.io") {
        return ["127.0.0.1"];
      }
      return ["8.8.8.8"];
    });

    const { requested } = mockOutbound((url) => {
      if (url.href === "https://example.com/favicon.ico") {
        return {
          status: 302,
          headers: { location: "https://127.0.0.1.nip.io/favicon.ico" },
        };
      }
      // Other candidate paths / hop targets: no usable icon body.
      return { status: 404 };
    });

    const bytes = await fetchRemoteFaviconBytes("example.com", { provider: "direct" });
    assert.equal(bytes, null);
    assert.ok(requested.some((entry) => entry.href === "https://example.com/favicon.ico"));
    assert.ok(!requested.some((entry) => entry.href.includes("127.0.0.1.nip.io")));
  });

  test("rejects non-default ports on redirect targets", async () => {
    setFaviconHostResolverForTests(async () => ["93.184.216.34"]);

    const { requested } = mockOutbound((url) => {
      if (url.href === "https://example.com/favicon.ico") {
        return {
          status: 302,
          headers: { location: "https://example.com:8443/secret.ico" },
        };
      }
      return { status: 404 };
    });

    const bytes = await fetchRemoteFaviconBytes("example.com", { provider: "direct" });
    assert.equal(bytes, null);
    assert.ok(requested.some((entry) => entry.href === "https://example.com/favicon.ico"));
    assert.ok(!requested.some((entry) => entry.href.includes(":8443")));
  });

  test("rejects oversized response bodies", async () => {
    setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
    const oversized = pngBytes(MAX_FAVICON_RESPONSE_BYTES + 1);

    const { requested } = mockOutbound(() => ({
      status: 200,
      headers: { "content-type": "image/png" },
      body: oversized,
    }));

    const bytes = await fetchRemoteFaviconBytes("example.com", { provider: "direct" });
    assert.equal(bytes, null);
    assert.ok(requested.length > 0);
  });

  test("accepts image bytes within the size limit", async () => {
    setFaviconHostResolverForTests(async () => ["93.184.216.34"]);
    const icon = pngBytes(128);

    mockOutbound((url) => {
      if (url.pathname === "/favicon.ico") {
        return {
          status: 200,
          headers: { "content-type": "image/png" },
          body: icon,
        };
      }
      return { status: 404 };
    });

    const bytes = await fetchRemoteFaviconBytes("example.com", { provider: "direct" });
    assert.ok(bytes);
    assert.equal(bytes.byteLength, 128);
  });
});
