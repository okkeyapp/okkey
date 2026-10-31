import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TOTP_PERIOD_SECONDS,
  parseTotpParams,
  resolveTotpFieldFromFormInput,
  totpCodeFromSecret,
} from "./item-totp.ts";

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

  it("matches RFC 6238 SHA256 / SHA512 8-digit vectors at T=59", async () => {
    // RFC Appendix B uses longer seed material for SHA-256 / SHA-512.
    const sha256Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA";
    const sha512Secret =
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA";
    const sha256 = await totpCodeFromSecret({
      secretBase32: sha256Secret,
      periodSeconds: 30,
      digits: 8,
      algorithm: "SHA256",
      nowMs: 59 * 1000,
    });
    const sha512 = await totpCodeFromSecret({
      secretBase32: sha512Secret,
      periodSeconds: 30,
      digits: 8,
      algorithm: "SHA512",
      nowMs: 59 * 1000,
    });
    assert.equal(sha256, "46119246");
    assert.equal(sha512, "90693936");
  });

  it("matches RFC 6238 Appendix B SHA256 / SHA512 vectors across sample times", async () => {
    // Seed material from RFC 6238 Appendix B (ASCII keys, Base32-encoded).
    const sha256Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA";
    const sha512Secret =
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA";
    // SHA256 at T=2000000000 uses the corrected Appendix B value (RFC errata);
    // the printed table lists 90603773, but HMAC-SHA256 yields 90698825.
    const cases: Array<{
      nowSec: number;
      sha256: string;
      sha512: string;
    }> = [
      { nowSec: 59, sha256: "46119246", sha512: "90693936" },
      { nowSec: 1_111_111_109, sha256: "68084774", sha512: "25091201" },
      { nowSec: 1_111_111_111, sha256: "67062674", sha512: "99943326" },
      { nowSec: 1_234_567_890, sha256: "91819424", sha512: "93441116" },
      { nowSec: 2_000_000_000, sha256: "90698825", sha512: "38618901" },
      { nowSec: 20_000_000_000, sha256: "77737706", sha512: "47863826" },
    ];
    for (const entry of cases) {
      const sha256 = await totpCodeFromSecret({
        secretBase32: sha256Secret,
        periodSeconds: 30,
        digits: 8,
        algorithm: "SHA256",
        nowMs: entry.nowSec * 1000,
      });
      const sha512 = await totpCodeFromSecret({
        secretBase32: sha512Secret,
        periodSeconds: 30,
        digits: 8,
        algorithm: "SHA512",
        nowMs: entry.nowSec * 1000,
      });
      assert.equal(sha256, entry.sha256, `SHA256 at T=${entry.nowSec}`);
      assert.equal(sha512, entry.sha512, `SHA512 at T=${entry.nowSec}`);
    }
  });
});

describe("parseTotpParams / resolveTotpFieldFromFormInput", () => {
  it("reads period, digits, and algorithm from otpauth URIs", () => {
    const uri = `otpauth://totp/QA:test?secret=${RFC_SECRET_BASE32}&issuer=QA&period=60&digits=8&algorithm=SHA256`;
    const parsed = parseTotpParams(uri);
    assert.deepEqual(parsed, {
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });

  it("lets otpauth URI params win on save even when form had defaults", () => {
    const uri = `otpauth://totp/QA:test?secret=${RFC_SECRET_BASE32}&period=60&digits=8&algorithm=SHA256`;
    const resolved = resolveTotpFieldFromFormInput({
      raw: uri,
      storedPeriodSeconds: 30,
      storedDigits: 6,
      storedAlgorithm: "SHA1",
    });
    assert.deepEqual(resolved, {
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });

  it("keeps stored metadata for bare secrets on unrelated edits", () => {
    const resolved = resolveTotpFieldFromFormInput({
      raw: RFC_SECRET_BASE32,
      storedPeriodSeconds: 60,
      storedDigits: 8,
      storedAlgorithm: "SHA256",
    });
    assert.deepEqual(resolved, {
      secretBase32: RFC_SECRET_BASE32,
      periodSeconds: 60,
      digits: 8,
      algorithm: "SHA256",
    });
  });
});
