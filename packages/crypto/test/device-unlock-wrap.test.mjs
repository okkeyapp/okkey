import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  generateDeviceBioWrapKey,
  initCrypto,
  unwrapUnlockMaterialWithBioKey,
  unwrapUnlockMaterialWithPin,
  wrapUnlockMaterialWithBioKey,
  wrapUnlockMaterialWithPin,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

function random32() {
  return crypto.getRandomValues(new Uint8Array(32));
}

test("PIN wrap round-trips VaultKey and password share C", async () => {
  const vaultKey = random32();
  const passwordShareC = random32();
  const pin = new TextEncoder().encode("123456");

  const wrap = await wrapUnlockMaterialWithPin({
    vaultKey,
    passwordShareC,
    pinUtf8: pin,
  });
  assert.match(wrap.kdfSaltB64, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(wrap.ciphertextB64.length > 0);
  assert.equal(wrap.ciphertextB64.includes(Buffer.from(vaultKey).toString("base64")), false);

  const opened = await unwrapUnlockMaterialWithPin({ wrap, pinUtf8: pin });
  assert.deepEqual(opened.vaultKey, vaultKey);
  assert.deepEqual(opened.passwordShareC, passwordShareC);
});

test("wrong PIN does not open the device unlock wrap", async () => {
  const vaultKey = random32();
  const passwordShareC = random32();
  const wrap = await wrapUnlockMaterialWithPin({
    vaultKey,
    passwordShareC,
    pinUtf8: new TextEncoder().encode("123456"),
  });

  await assert.rejects(() =>
    unwrapUnlockMaterialWithPin({
      wrap,
      pinUtf8: new TextEncoder().encode("000000"),
    }),
  );
});

test("biometric wrap round-trips and is not interchangeable with a PIN wrap", async () => {
  const vaultKey = random32();
  const passwordShareC = random32();
  const pin = new TextEncoder().encode("123456");
  const bioWrapKey = await generateDeviceBioWrapKey();
  assert.equal(bioWrapKey.length, 32);

  const pinWrap = await wrapUnlockMaterialWithPin({
    vaultKey,
    passwordShareC,
    pinUtf8: pin,
  });
  const bioCiphertext = await wrapUnlockMaterialWithBioKey({
    vaultKey,
    passwordShareC,
    bioWrapKey,
  });

  const opened = await unwrapUnlockMaterialWithBioKey({
    ciphertextB64: bioCiphertext,
    bioWrapKey,
  });
  assert.deepEqual(opened.vaultKey, vaultKey);
  assert.deepEqual(opened.passwordShareC, passwordShareC);

  const wrongBio = await generateDeviceBioWrapKey();
  await assert.rejects(() =>
    unwrapUnlockMaterialWithBioKey({
      ciphertextB64: bioCiphertext,
      bioWrapKey: wrongBio,
    }),
  );

  // Distinct AAD: a PIN ciphertext must not open under the biometric wrap key.
  await assert.rejects(() =>
    unwrapUnlockMaterialWithBioKey({
      ciphertextB64: pinWrap.ciphertextB64,
      bioWrapKey,
    }),
  );
});

test("PIN and biometric wraps reject short keys", async () => {
  const vaultKey = random32();
  const passwordShareC = random32();
  const short = new Uint8Array(16);

  await assert.rejects(
    () =>
      wrapUnlockMaterialWithPin({
        vaultKey: short,
        passwordShareC,
        pinUtf8: new TextEncoder().encode("123456"),
      }),
    /32 bytes/,
  );
  await assert.rejects(
    () =>
      wrapUnlockMaterialWithBioKey({
        vaultKey,
        passwordShareC,
        bioWrapKey: short,
      }),
    /32 bytes/,
  );
});
