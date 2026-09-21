import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  generateRecoverySecret,
  initCrypto,
  unwrapVaultKeyWithRecoverySecret,
  wrapVaultKeyWithRecoverySecret,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

test("recovery secret generate + wrap/unwrap round-trip", async () => {
  const vaultKey = crypto.getRandomValues(new Uint8Array(32));
  const secret = await generateRecoverySecret();
  assert.match(secret, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4})+$/);

  const secretBytes = new TextEncoder().encode(secret);
  const wrapped = await wrapVaultKeyWithRecoverySecret(vaultKey, secretBytes);
  assert.equal(wrapped.meta.entity, "vault_key_recovery_wrap");
  assert.equal(wrapped.meta.key_scope, "account");
  assert.equal(typeof wrapped.payload, "string");
  assert.ok(wrapped.payload.length > 0);

  const unwrapped = await unwrapVaultKeyWithRecoverySecret(secretBytes, wrapped);
  assert.deepEqual(unwrapped, vaultKey);
});

test("recovery unwrap fails with wrong secret", async () => {
  const vaultKey = crypto.getRandomValues(new Uint8Array(32));
  const secret = await generateRecoverySecret();
  const wrong = await generateRecoverySecret();
  const wrapped = await wrapVaultKeyWithRecoverySecret(
    vaultKey,
    new TextEncoder().encode(secret),
  );
  await assert.rejects(
    () => unwrapVaultKeyWithRecoverySecret(new TextEncoder().encode(wrong), wrapped),
  );
});
