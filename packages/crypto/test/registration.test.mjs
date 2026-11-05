import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildRegistrationCryptoArtifacts,
  initCrypto,
  rebalanceServerShareForNewPassword,
  reconstructVaultKeyWithMasterPassword,
  registrationArtifactsToWire,
} from "../dist/index.js";

const wasmBytes = await readFile(new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url));
await initCrypto({ module_or_path: wasmBytes });

test("registration seals share B and still reconstructs VaultKey from the raw term", async () => {
  const password = new TextEncoder().encode("q2-6-split-key-test-password");
  const material = await buildRegistrationCryptoArtifacts(password);

  assert.equal(material.serverKeyShare.length, 32);
  assert.equal(material.deviceShare.length, 32);
  assert.equal(material.vaultKey.length, 32);
  assert.equal(material.wrappedDeviceShare.length > 32, true);
  assert.ok(material.userPublicPqKey.length > 32);

  const recovered = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: password,
    serverKeyShare: material.serverKeyShare,
    deviceShare: material.deviceShare,
    passwordKdfSalt: material.passwordKdfSalt,
    passwordKdfParamsVersion: material.passwordKdfParamsVersion,
  });
  assert.deepEqual(recovered, material.vaultKey);
});

test("registration wire omits master password, VaultKey, and password share C", async () => {
  // docs/architecture/10_authentication_flows.md + docs/api_contracts.md:
  // master password, share C, and raw VaultKey never appear on the wire.
  const passwordText = "master-password-not-on-wire-9f3c";
  const password = new TextEncoder().encode(passwordText);
  const material = await buildRegistrationCryptoArtifacts(password);
  const wire = registrationArtifactsToWire(material);
  const encoded = JSON.stringify(wire);

  assert.equal(encoded.includes(passwordText), false);
  assert.equal(encoded.includes(Buffer.from(material.vaultKey).toString("base64")), false);
  assert.equal(Object.hasOwn(wire, "master_password"), false);
  assert.equal(Object.hasOwn(wire, "vault_key"), false);
  assert.equal(Object.hasOwn(wire, "password_share"), false);
  assert.equal(Object.hasOwn(wire, "device_share"), false);
  assert.notDeepEqual(Buffer.from(wire.server_key_share, "base64"), Buffer.from(material.vaultKey));
});

test("new master passwords must be at least 12 characters; unlock still accepts a shorter one", async () => {
  const short = new TextEncoder().encode("short-pass");
  await assert.rejects(
    () => buildRegistrationCryptoArtifacts(short),
    /at least 12 characters/,
  );

  await assert.rejects(
    () =>
      rebalanceServerShareForNewPassword({
        newMasterPasswordUtf8: short,
        vaultKey: new Uint8Array(32),
        deviceShare: new Uint8Array(32),
      }),
    /at least 12 characters/,
  );

  // 6 Cyrillic characters are 12 UTF-8 bytes. Length is counted in characters.
  const cyrillic = new TextEncoder().encode("пароль");
  assert.equal(cyrillic.length, 12);
  await assert.rejects(
    () => buildRegistrationCryptoArtifacts(cyrillic),
    /at least 12 characters/,
  );

  const unlocked = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: short,
    serverKeyShare: new Uint8Array(32).fill(1),
    deviceShare: new Uint8Array(32).fill(2),
    passwordKdfSalt: new Uint8Array(16).fill(3),
    passwordKdfParamsVersion: 2,
  });
  assert.equal(unlocked.length, 32);
});
