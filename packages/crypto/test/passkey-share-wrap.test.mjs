import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  initCrypto,
  openPasskeyShareWrap,
  PASSKEY_SHARE_WRAP_LEN,
  sealPasskeyShareWrap,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

function random32() {
  return crypto.getRandomValues(new Uint8Array(32));
}

test("PRF wrap round-trips share B and hides it", async () => {
  const deviceShare = random32();
  const prfOutput = random32();
  const salt = random32();
  const wrap = await sealPasskeyShareWrap({
    deviceShare,
    prfOutput,
    salt,
    credentialId: "cred-1",
  });
  assert.equal(wrap.length, PASSKEY_SHARE_WRAP_LEN);
  assert.equal(wrap[0], 1);
  assert.equal(Buffer.from(wrap).includes(Buffer.from(deviceShare)), false);
  assert.equal(Buffer.from(wrap).includes(Buffer.from(prfOutput)), false);

  const opened = await openPasskeyShareWrap({
    wrap,
    prfOutput,
    salt,
    credentialId: "cred-1",
  });
  assert.deepEqual(opened, deviceShare);
});

test("PRF wrap rejects a tampered ciphertext and a different credential id", async () => {
  const input = {
    deviceShare: random32(),
    prfOutput: random32(),
    salt: random32(),
    credentialId: "cred-1",
  };
  const wrap = await sealPasskeyShareWrap(input);
  const tampered = wrap.slice();
  tampered[tampered.length - 1] ^= 0xff;
  await assert.rejects(() =>
    openPasskeyShareWrap({
      wrap: tampered,
      prfOutput: input.prfOutput,
      salt: input.salt,
      credentialId: input.credentialId,
    }),
  );
  await assert.rejects(() =>
    openPasskeyShareWrap({
      wrap,
      prfOutput: input.prfOutput,
      salt: input.salt,
      credentialId: "cred-2",
    }),
  );
});
