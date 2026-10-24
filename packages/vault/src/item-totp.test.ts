import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_TOTP_PERIOD_SECONDS, totpCodeFromSecret } from "./item-totp.ts";

const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totpCodeFromSecret", () => {
  it("matches RFC 6238 SHA1 8-digit vector at T=59", async () => {
    const code = await totpCodeFromSecret({
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 30,
      digits: 8,
      nowMs: 59 * 1000,
    });
    assert.equal(code, "94287082");
  });

  it("defaults bare Base32 secrets to a 30 s period", async () => {
    assert.equal(DEFAULT_TOTP_PERIOD_SECONDS, 30);
    const withExplicit = await totpCodeFromSecret({
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 30,
      digits: 8,
      nowMs: 59 * 1000,
    });
    const withDefault = await totpCodeFromSecret({
      secretBase32: RFC_SECRET_BASE32,
      digits: 8,
      nowMs: 59 * 1000,
    });
    assert.equal(withDefault, withExplicit);
    assert.equal(withDefault, "94287082");
  });

  it("honors a stored non-default period over URI period", async () => {
    const uri = `otpauth://totp/Example:user?secret=${RFC_SECRET_BASE32}&period=60&digits=8`;
    const stored30 = await totpCodeFromSecret({
      secretBase32: uri,
      periodSeconds: 30,
      digits: 8,
      nowMs: 59 * 1000,
    });
    const fromUri60 = await totpCodeFromSecret({
      secretBase32: uri,
      digits: 8,
      nowMs: 59 * 1000,
    });
    assert.equal(stored30, "94287082");
    assert.notEqual(fromUri60, stored30);
  });
});
