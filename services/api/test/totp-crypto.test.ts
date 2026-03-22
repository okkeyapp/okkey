import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashBackupCode, normalizeBackupCodeInput, verifyBackupCodeHash } from "../src/crypto/backup-code.ts";
import { deriveAes256KeyFromSessionSecret, openSecret, sealSecret } from "../src/crypto/server-aes.ts";
import { base32Decode, base32Encode, totpAt, verifyTotpCode } from "../src/crypto/totp-rfc6238.ts";

test("AES seal/open roundtrip for TOTP secret bytes", () => {
  const key = deriveAes256KeyFromSessionSecret("unit-test-secret");
  const plain = randomBytes(20);
  const packed = sealSecret(key, plain);
  const out = openSecret(key, packed);
  assert.equal(Buffer.compare(out, Buffer.from(plain)), 0);
});

test("base32 encode/decode roundtrip", () => {
  const plain = randomBytes(20);
  const enc = base32Encode(plain);
  const dec = base32Decode(enc);
  assert.deepEqual(dec, Buffer.from(plain));
});

test("TOTP verify accepts code for same time step", () => {
  const secret = Buffer.alloc(20, 7);
  const unixSeconds = 1_700_000_000;
  const code = totpAt(secret, unixSeconds, 30, 6);
  assert.ok(
    verifyTotpCode({
      secret,
      code,
      unixSeconds,
      periodSeconds: 30,
      digits: 6,
      windowSteps: 1,
    }),
  );
});

test("backup code hash verify", () => {
  const pepper = "pepper";
  const plain = "A1B2-C3D4-E5";
  const h = hashBackupCode(plain, pepper);
  assert.ok(verifyBackupCodeHash(plain, pepper, h));
  assert.equal(normalizeBackupCodeInput("a1b2-c3d4-e5"), "A1B2C3D4E5");
});
