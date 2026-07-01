import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { bytesEqual, hostsFromUrls } from "../src/favicon/fetch-remote.ts";

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

describe("bytesEqual", () => {
  test("compares byte arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    assert.equal(bytesEqual(a, a), true);
    assert.equal(bytesEqual(a, new Uint8Array([1, 2, 3])), true);
    assert.equal(bytesEqual(a, new Uint8Array([1, 2])), false);
  });
});
