import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { totpCodeFromSecret } from "./item-totp.ts";

describe("totpCodeFromSecret", () => {
  it("matches RFC 6238 SHA1 8-digit vector at T=59", async () => {
    const code = await totpCodeFromSecret({
      secretBase32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      periodSeconds: 30,
      digits: 8,
      nowMs: 59 * 1000,
    });
    assert.equal(code, "94287082");
  });
});
